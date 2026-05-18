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
    dest = os.path.join(sync_target, f"{user_id}_timelog.db")
    try:
        shutil.copy2(local_db_path, dest)
        logger.info(f"Remote user DB synced: {dest}")
        return True
    except OSError as e:
        logger.warning(f"Remote user DB sync failed: {e}")
        return False


# --- Pull 60-day history ---

def pull_history(cfg, local_db_path):
    """Pull user's last 60 days from master into local TimeLogTable. Non-destructive (skips existing uids)."""
    master = _master_path(cfg)
    if not master:
        return False, "Master DB not found"

    user_id = cfg.get("user_id")
    if not user_id:
        return False, "No user_id"

    # Calculate JDN for 60 days ago
    from db import iso_to_jdn
    cutoff_iso = (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")
    cutoff_jdn = iso_to_jdn(cutoff_iso)

    try:
        mconn = sqlite3.connect(master, timeout=10)
        mconn.row_factory = sqlite3.Row
        rows = mconn.execute(
            "SELECT * FROM TimeLogTable WHERE uid LIKE ? AND date >= ? AND uid NOT LIKE 'v-%'",
            (f"{user_id}_%", cutoff_jdn)
        ).fetchall()
        mconn.close()
    except Exception as e:
        logger.error(f"Pull from master failed: {e}")
        return False, str(e)

    if not rows:
        logger.info("No history to pull from master")
        return True, None

    # Insert into local DB (skip duplicates)
    lconn = sqlite3.connect(local_db_path, timeout=10)
    inserted = 0
    for r in rows:
        try:
            lconn.execute(
                "INSERT INTO TimeLogTable (uid, date, job, time, e_time, memo, device, qty) VALUES (?,?,?,?,?,?,?,?)",
                (r["uid"], r["date"], r["job"], r["time"], r["e_time"], r["memo"], r["device"], r["qty"])
            )
            inserted += 1
        except sqlite3.IntegrityError:
            pass
    lconn.commit()
    lconn.close()
    logger.info(f"Pulled {inserted} new rows from master (of {len(rows)} total in range)")
    return True, None
