"""SQLite layer for DayBuilder — TimeLogTable + DayDraft schema and CRUD."""
import sqlite3
import json
import os
import time as _time
from datetime import datetime, date, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "timelog.db")


def get_db(db_path=None):
    conn = sqlite3.connect(db_path or DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path=None):
    conn = get_db(db_path)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS TimeLogTable (
            uid TEXT PRIMARY KEY,
            date DATE,
            job TEXT,
            time TIME,
            e_time TIME,
            memo TEXT,
            device TEXT,
            qty INT
        );
        CREATE TABLE IF NOT EXISTS DayDraft (
            date TEXT PRIMARY KEY,
            blocks TEXT,
            posted INTEGER DEFAULT 0,
            posted_at TEXT
        );
    """)
    conn.commit()
    conn.close()


# --- JDN / Unix timestamp helpers (master DB format) ---

def iso_to_jdn(iso_date):
    """YYYY-MM-DD → Julian Day Number (integer)."""
    d = date.fromisoformat(iso_date)
    # Algorithm: https://en.wikipedia.org/wiki/Julian_day
    a = (14 - d.month) // 12
    y = d.year + 4800 - a
    m = d.month + 12 * a - 3
    return d.day + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045


def jdn_to_iso(jdn):
    """Julian Day Number → YYYY-MM-DD string."""
    # Algorithm from Meeus
    l = jdn + 68569
    n = 4 * l // 146097
    l = l - (146097 * n + 3) // 4
    i = 4000 * (l + 1) // 1461001
    l = l - 1461 * i // 4 + 31
    j = 80 * l // 2447
    day = l - 2447 * j // 80
    l = j // 11
    month = j + 2 - 12 * l
    year = 100 * (n - 49) + i + l
    return f"{year:04d}-{month:02d}-{day:02d}"


def time_to_unix(time_24h, iso_date):
    """HH:MM (24h) + YYYY-MM-DD → unix timestamp (int)."""
    h, m = int(time_24h.split(":")[0]), int(time_24h.split(":")[1])
    dt = datetime.fromisoformat(f"{iso_date}T{h:02d}:{m:02d}:00")
    return int(dt.timestamp())


def unix_to_time(ts):
    """Unix timestamp → HH:MM (24h)."""
    dt = datetime.fromtimestamp(ts)
    return f"{dt.hour:02d}:{dt.minute:02d}"


def get_timelog_by_jdn(user_id, jdn, db_path):
    """Get rows from TimeLogTable for a user on a specific JDN."""
    conn = get_db(db_path)
    rows = conn.execute(
        "SELECT * FROM TimeLogTable WHERE uid LIKE ? AND date = ? AND uid NOT LIKE 'v-%' ORDER BY time",
        (f"{user_id}_%", jdn)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# --- DayDraft CRUD ---

def get_draft(date_iso, db_path=None):
    """Get DayDraft for a date (YYYY-MM-DD). Returns dict or None."""
    conn = get_db(db_path)
    row = conn.execute("SELECT * FROM DayDraft WHERE date = ?", (date_iso,)).fetchone()
    conn.close()
    if row:
        return {"date": row["date"], "blocks": json.loads(row["blocks"]),
                "posted": bool(row["posted"]), "posted_at": row["posted_at"]}
    return None


def save_draft(date_iso, blocks, db_path=None):
    """Upsert DayDraft blocks for a date."""
    conn = get_db(db_path)
    conn.execute(
        "INSERT INTO DayDraft (date, blocks) VALUES (?, ?) "
        "ON CONFLICT(date) DO UPDATE SET blocks = excluded.blocks",
        (date_iso, json.dumps(blocks))
    )
    conn.commit()
    conn.close()


def delete_draft(date_iso, db_path=None):
    conn = get_db(db_path)
    conn.execute("DELETE FROM DayDraft WHERE date = ?", (date_iso,))
    conn.commit()
    conn.close()


# --- TimeLogTable CRUD ---

def get_timelog_rows(date_iso, db_path=None):
    """Get TimeLogTable rows for a date. Accepts ISO, queries legacy format."""
    legacy = _iso_to_legacy(date_iso)
    conn = get_db(db_path)
    rows = conn.execute("SELECT * FROM TimeLogTable WHERE date = ? ORDER BY uid", (legacy,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_timelog_range(from_iso, to_iso, db_path=None):
    """Get TimeLogTable rows for a date range (inclusive)."""
    conn = get_db(db_path)
    rows = conn.execute(
        "SELECT * FROM TimeLogTable ORDER BY date, uid"
    ).fetchall()
    conn.close()
    results = []
    for r in rows:
        row_iso = _legacy_to_iso(r["date"])
        if row_iso and from_iso <= row_iso <= to_iso:
            results.append(dict(r))
    return results


def insert_timelog_rows(rows, db_path=None):
    """Insert list of row dicts into TimeLogTable."""
    conn = get_db(db_path)
    for r in rows:
        conn.execute(
            "INSERT INTO TimeLogTable (uid, date, job, time, e_time, memo, device, qty) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (r["uid"], r["date"], r["job"], r["time"], r["e_time"], r["memo"], r.get("device"), r.get("qty"))
        )
    conn.commit()
    conn.close()


def delete_timelog_by_date(date_iso, db_path=None):
    """Delete all TimeLogTable rows for a date."""
    legacy = _iso_to_legacy(date_iso)
    conn = get_db(db_path)
    conn.execute("DELETE FROM TimeLogTable WHERE date = ?", (legacy,))
    conn.commit()
    conn.close()


# --- Date format helpers ---

def _iso_to_legacy(iso_date):
    """YYYY-MM-DD → MM/DD/YYYY"""
    parts = iso_date.split("-")
    return f"{parts[1]}/{parts[2]}/{parts[0]}"


def _legacy_to_iso(legacy_date):
    """MM/DD/YYYY → YYYY-MM-DD"""
    try:
        parts = legacy_date.split("/")
        return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
    except (IndexError, AttributeError):
        return None


if __name__ == "__main__":
    init_db()
    print(f"Database initialized at {DB_PATH}")
