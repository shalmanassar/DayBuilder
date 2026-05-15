"""SQLite layer for DayBuilder — TimeLogTable + DayDraft schema and CRUD."""
import sqlite3
import json
import os
from datetime import datetime

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
