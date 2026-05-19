"""sync.py — Master DB sync: append-only writes, lock-file, backup, void/replace, 60-day pull."""
import os
import shutil
import sqlite3
import time
import logging
from pathlib import Path
from datetime import datetime, timedelta

logger = logging.getLogger("daybuilder")

LOCK_TIMEOUT = 30  # seconds to wait for lock
LOCK_RETRY_INTERVAL = 0.5
MAX_BACKUPS = 200

MASTER_DB_NAME = "m_timelog.db"
LOCK_FILE_NAME = "m_timelog.lock"
BACKUP_DIR = r"W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering\RAD1\RMAJobLogger\oldversions\backups"


def _master_path(cfg):
    sync_target = cfg.get("sync_target")
    if not sync_target:
        return None
    p = os.path.join(sync_target, MASTER_DB_NAME)
    return p if os.path.isfile(p) else None


def _lock_path(cfg):
    sync_target = cfg.get("sync_target")
    if not sync_target:
        return None
    return os.path.join(sync_target, LOCK_FILE_NAME)


# --- Lock file ---

def _acquire_lock(cfg):
    """Acquire lock file. Returns True on success, False on timeout."""
    lock = _lock_path(cfg)
    if not lock:
        return False
    deadline = time.time() + LOCK_TIMEOUT
    while time.time() < deadline:
        try:
            # Create lock file exclusively (fails if exists)
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, f"{cfg.get('user_id','?')}:{int(time.time())}".encode())
            os.close(fd)
            return True
        except FileExistsError:
            # Check if lock is stale (older than LOCK_TIMEOUT)
            try:
                age = time.time() - os.path.getmtime(lock)
                if age > LOCK_TIMEOUT:
                    os.remove(lock)
                    continue
            except OSError:
                pass
            time.sleep(LOCK_RETRY_INTERVAL)
        except OSError as e:
            logger.warning(f"Lock acquire error: {e}")
            time.sleep(LOCK_RETRY_INTERVAL)
    logger.error("Lock acquire timeout")
    return False


def _release_lock(cfg):
    lock = _lock_path(cfg)
    if lock:
        try:
            os.remove(lock)
        except OSError:
            pass


# --- Backup ---

def backup_master(cfg):
    """Copy master DB to backup dir with timestamp. Prune to MAX_BACKUPS."""
    master = _master_path(cfg)
    if not master:
        return None
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = os.path.join(BACKUP_DIR, f"m_timelog_{ts}.db")
    try:
        shutil.copy2(master, dest)
        logger.info(f"Master backed up: {dest}")
    except OSError as e:
        logger.error(f"Master backup failed: {e}")
        return None
    # Prune old backups
    _prune_backups()
    return dest


def _prune_backups():
    try:
        files = sorted(Path(BACKUP_DIR).glob("m_timelog_*.db"), key=lambda f: f.stat().st_mtime)
        while len(files) > MAX_BACKUPS:
            files.pop(0).unlink()
    except OSError:
        pass


# --- Append to master ---

def append_to_master(cfg, rows):
    """Append rows to master DB. Backup first, lock, append, unlock. Returns (ok, error)."""
    master = _master_path(cfg)
    if not master:
        return False, "Master DB not found"
    if not rows:
        return True, None

    if not _acquire_lock(cfg):
        return False, "Could not acquire lock on master DB"

    try:
        backup_master(cfg)
        conn = sqlite3.connect(master, timeout=10)
        for r in rows:
            try:
                conn.execute(
                    "INSERT INTO TimeLogTable (uid, date, job, time, e_time, memo, device, qty) VALUES (?,?,?,?,?,?,?,?)",
                    (r["uid"], r["date"], r["job"], r["time"], r["e_time"], r["memo"], r.get("device", ""), r.get("qty", ""))
                )
            except sqlite3.IntegrityError:
                # UID already exists — skip (idempotent)
                pass
        conn.commit()
        conn.close()
        logger.info(f"Appended {len(rows)} rows to master")
        return True, None
    except Exception as e:
        logger.error(f"Append to master failed: {e}")
        return False, str(e)
    finally:
        _release_lock(cfg)


# --- Void and replace ---

def void_and_replace(cfg, old_uid, new_row):
    """Void an existing entry (prefix uid with v-) and append replacement. Returns (ok, error)."""
    master = _master_path(cfg)
    if not master:
        return False, "Master DB not found"

    if not _acquire_lock(cfg):
        return False, "Could not acquire lock on master DB"

    try:
        backup_master(cfg)
        conn = sqlite3.connect(master, timeout=10)
        # Void: rename uid to v-{uid}
        voided_uid = f"v-{old_uid}"
        conn.execute("UPDATE TimeLogTable SET uid = ? WHERE uid = ?", (voided_uid, old_uid))
        # Append replacement
        conn.execute(
            "INSERT INTO TimeLogTable (uid, date, job, time, e_time, memo, device, qty) VALUES (?,?,?,?,?,?,?,?)",
            (new_row["uid"], new_row["date"], new_row["job"], new_row["time"],
             new_row["e_time"], new_row["memo"], new_row.get("device", ""), new_row.get("qty", ""))
        )
        conn.commit()
        conn.close()
        logger.info(f"Voided {old_uid}, replaced with {new_row['uid']}")
        return True, None
    except Exception as e:
        logger.error(f"Void/replace failed: {e}")
        return False, str(e)
    finally:
        _release_lock(cfg)


def sync_user_db(cfg, local_db_path):
    """Copy local DB to remote user DB on share. This is the authoritative per-user backup."""
    sync_target = cfg.get("sync_target")
    user_id = cfg.get("user_id")
    if not sync_target or not user_id or not os.path.isdir(sync_target):
        return False
    # Don't overwrite remote with an empty local DB
    try:
        conn = sqlite3.connect(local_db_path, timeout=5)
        local_rows = conn.execute("SELECT COUNT(*) FROM TimeLogTable").fetchone()[0]
        conn.close()
        if local_rows == 0:
            logger.info("Skipping remote sync — local DB is empty")
            return False
    except Exception:
        return False
    dest = os.path.join(sync_target, f"{user_id}_timelog.db")
    try:
        shutil.copy2(local_db_path, dest)
        logger.info(f"Remote user DB synced: {dest}")
        return True
    except OSError as e:
        logger.warning(f"Remote user DB sync failed: {e}")
        return False


# --- Startup sync ---

def startup_sync(cfg, local_db_path):
    """Startup sync logic:
    - If remote user DB exists: pull last 60 days from it into local, push any local rows missing from remote.
    - If remote user DB doesn't exist (initial): pull user's rows from master, create remote user DB.
    - Master is never read after initial setup.
    """
    sync_target = cfg.get("sync_target")
    user_id = cfg.get("user_id")
    if not sync_target or not user_id:
        return False, "No sync_target or user_id"
    if not os.path.isdir(sync_target):
        return False, "Sync target unreachable"

    remote_user_path = os.path.join(sync_target, f"{user_id}_timelog.db")

    if os.path.isfile(remote_user_path):
        # Subsequent startup: sync between local and remote user DB
        return _sync_local_remote(cfg, local_db_path, remote_user_path)
    else:
        # Initial startup: bootstrap from master, then create remote user DB
        return _initial_bootstrap(cfg, local_db_path, remote_user_path)


def _sync_local_remote(cfg, local_db_path, remote_user_path):
    """Subsequent startup: ensure local has last 60 days from remote, push local rows to remote."""
    user_id = cfg.get("user_id")
    from db import iso_to_jdn
    cutoff_jdn = iso_to_jdn((datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d"))

    # Pull last 60 days from remote into local (skip existing)
    try:
        rconn = sqlite3.connect(remote_user_path, timeout=10)
        rconn.row_factory = sqlite3.Row
        rows = rconn.execute(
            "SELECT * FROM TimeLogTable WHERE uid LIKE ? AND date >= ? AND uid NOT LIKE 'v-%'",
            (f"{user_id}_%", cutoff_jdn)
        ).fetchall()
        rconn.close()
    except Exception as e:
        logger.warning(f"Read remote user DB failed: {e}")
        return False, str(e)

    lconn = sqlite3.connect(local_db_path, timeout=10)
    pulled = 0
    for r in rows:
        try:
            lconn.execute(
                "INSERT INTO TimeLogTable (uid, date, job, time, e_time, memo, device, qty) VALUES (?,?,?,?,?,?,?,?)",
                (r["uid"], r["date"], r["job"], r["time"], r["e_time"], r["memo"], r["device"], r["qty"])
            )
            pulled += 1
        except sqlite3.IntegrityError:
            pass
    lconn.commit()

    # Push any local rows missing from remote
    lconn.row_factory = sqlite3.Row
    local_rows = lconn.execute(
        "SELECT * FROM TimeLogTable WHERE uid LIKE ? AND uid NOT LIKE 'v-%'",
        (f"{user_id}_%",)
    ).fetchall()
    lconn.close()

    try:
        rconn = sqlite3.connect(remote_user_path, timeout=10)
        pushed = 0
        for r in local_rows:
            try:
                rconn.execute(
                    "INSERT INTO TimeLogTable (uid, date, job, time, e_time, memo, device, qty) VALUES (?,?,?,?,?,?,?,?)",
                    (r["uid"], r["date"], r["job"], r["time"], r["e_time"], r["memo"], r["device"], r["qty"])
                )
                pushed += 1
            except sqlite3.IntegrityError:
                pass
        rconn.commit()
        rconn.close()
    except Exception as e:
        logger.warning(f"Push to remote user DB failed: {e}")

    # Sync DayDraft both directions
    draft_pulled, draft_pushed = _sync_drafts(local_db_path, remote_user_path)

    logger.info(f"Startup sync: pulled {pulled} rows + {draft_pulled} drafts from remote, pushed {pushed} rows + {draft_pushed} drafts to remote")
    return True, None


def _sync_drafts(local_db_path, remote_user_path):
    """Bidirectional DayDraft sync: pull missing from remote, push missing to remote."""
    pulled = pushed = 0
    try:
        rconn = sqlite3.connect(remote_user_path, timeout=10)
        rconn.row_factory = sqlite3.Row
        lconn = sqlite3.connect(local_db_path, timeout=10)
        lconn.row_factory = sqlite3.Row

        # Ensure DayDraft table exists in remote
        rconn.execute("""CREATE TABLE IF NOT EXISTS DayDraft (
            date TEXT PRIMARY KEY, blocks TEXT, posted INTEGER DEFAULT 0, posted_at TEXT)""")
        rconn.commit()

        # Pull from remote into local
        remote_drafts = rconn.execute("SELECT date, blocks, posted, posted_at FROM DayDraft").fetchall()
        for d in remote_drafts:
            try:
                lconn.execute("INSERT INTO DayDraft (date, blocks, posted, posted_at) VALUES (?,?,?,?)",
                              (d["date"], d["blocks"], d["posted"], d["posted_at"]))
                pulled += 1
            except sqlite3.IntegrityError:
                # Local already has this date — keep the one with more data or posted status
                local_d = lconn.execute("SELECT posted, length(blocks) as blen FROM DayDraft WHERE date=?", (d["date"],)).fetchone()
                remote_blen = len(d["blocks"]) if d["blocks"] else 0
                local_blen = local_d["blen"] if local_d else 0
                if d["posted"] and not local_d["posted"]:
                    lconn.execute("UPDATE DayDraft SET blocks=?, posted=?, posted_at=? WHERE date=?",
                                  (d["blocks"], d["posted"], d["posted_at"], d["date"]))
                elif remote_blen > local_blen and not local_d["posted"]:
                    lconn.execute("UPDATE DayDraft SET blocks=? WHERE date=?", (d["blocks"], d["date"]))
        lconn.commit()

        # Push from local to remote
        local_drafts = lconn.execute("SELECT date, blocks, posted, posted_at FROM DayDraft").fetchall()
        for d in local_drafts:
            try:
                rconn.execute("INSERT INTO DayDraft (date, blocks, posted, posted_at) VALUES (?,?,?,?)",
                              (d["date"], d["blocks"], d["posted"], d["posted_at"]))
                pushed += 1
            except sqlite3.IntegrityError:
                remote_d = rconn.execute("SELECT posted, length(blocks) as blen FROM DayDraft WHERE date=?", (d["date"],)).fetchone()
                local_blen = len(d["blocks"]) if d["blocks"] else 0
                remote_blen = remote_d["blen"] if remote_d else 0
                if d["posted"] and not remote_d["posted"]:
                    rconn.execute("UPDATE DayDraft SET blocks=?, posted=?, posted_at=? WHERE date=?",
                                  (d["blocks"], d["posted"], d["posted_at"], d["date"]))
                elif local_blen > remote_blen and not remote_d["posted"]:
                    rconn.execute("UPDATE DayDraft SET blocks=? WHERE date=?", (d["blocks"], d["date"]))
        rconn.commit()

        lconn.close()
        rconn.close()
    except Exception as e:
        logger.warning(f"DayDraft sync failed: {e}")

    return pulled, pushed


def _initial_bootstrap(cfg, local_db_path, remote_user_path):
    """Initial startup: pull user's rows from master into local, then create remote user DB."""
    user_id = cfg.get("user_id")
    master = _master_path(cfg)

    if master:
        # Pull ALL user rows from master (not just 60 days — this is the one-time bootstrap)
        try:
            mconn = sqlite3.connect(master, timeout=10)
            mconn.row_factory = sqlite3.Row
            rows = mconn.execute(
                "SELECT * FROM TimeLogTable WHERE uid LIKE ? AND uid NOT LIKE 'v-%'",
                (f"{user_id}_%",)
            ).fetchall()
            mconn.close()
        except Exception as e:
            logger.error(f"Initial pull from master failed: {e}")
            return False, str(e)

        lconn = sqlite3.connect(local_db_path, timeout=10)
        for r in rows:
            try:
                lconn.execute(
                    "INSERT INTO TimeLogTable (uid, date, job, time, e_time, memo, device, qty) VALUES (?,?,?,?,?,?,?,?)",
                    (r["uid"], r["date"], r["job"], r["time"], r["e_time"], r["memo"], r["device"], r["qty"])
                )
            except sqlite3.IntegrityError:
                pass
        lconn.commit()
        lconn.close()
        logger.info(f"Initial bootstrap: pulled {len(rows)} rows from master")
    else:
        logger.warning("No master DB found for initial bootstrap")

    # Create remote user DB from local
    sync_user_db(cfg, local_db_path)
    logger.info(f"Created remote user DB: {remote_user_path}")
    return True, None
