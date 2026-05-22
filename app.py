"""Flask application factory for DayBuilder API."""
import json
import os
import signal
from flask import Flask, request, jsonify, send_from_directory, Response
import db


def create_app(cfg, web_root, db_path, share_ok):
    app = Flask(__name__, static_folder=None)
    app.config["CFG"] = cfg
    app.config["WEB_ROOT"] = web_root
    app.config["DB_PATH"] = db_path
    app.config["SHARE_OK"] = share_ok

    def _get_web_root():
        """Return current web_root, checking if it was updated after setup."""
        wr = app.config["WEB_ROOT"]
        if wr and os.path.isdir(wr):
            return wr
        # Check if config was updated with a valid web_root
        new_wr = cfg.get("web_root")
        if new_wr and os.path.isdir(new_wr):
            app.config["WEB_ROOT"] = new_wr
            app.config["SHARE_OK"] = True
            return new_wr
        return None

    def _serve_embedded_setup():
        from bootstrap import SETUP_HTML
        return Response(SETUP_HTML, mimetype='text/html')

    # --- Static file serving ---
    @app.route("/")
    def index():
        wr = _get_web_root()
        if not all(cfg.get(k) for k in ("user_id", "target_workbook")):
            return _serve_embedded_setup()
        if not wr:
            return _serve_embedded_setup()
        return send_from_directory(wr, "index.html")

    @app.route("/setup")
    def setup():
        return _serve_embedded_setup()

    @app.route("/<path:filename>")
    def static_files(filename):
        wr = _get_web_root()
        if not wr:
            return Response("Setup not complete", status=404)
        return send_from_directory(wr, filename)

    # --- /api/config ---
    @app.route("/api/config", methods=["GET"])
    def get_config():
        wr = _get_web_root()
        shared = {}
        if wr:
            shared_path = os.path.join(wr, "shared_config.json")
            if os.path.isfile(shared_path):
                with open(shared_path) as f:
                    shared = json.load(f)
        version = {}
        if wr:
            ver_path = os.path.join(wr, "version.json")
            if os.path.isfile(ver_path):
                with open(ver_path) as f:
                    version = json.load(f)
        return jsonify({"user": cfg, "shared": shared, "version": version})

    @app.route("/api/config", methods=["POST"])
    def update_config():
        updates = request.get_json(force=True)
        cfg.update(updates)
        from bootstrap import save_config, sync_cache, CACHE_DIR
        save_config(cfg)
        # If web_root was just set, sync cache for offline fallback
        new_wr = updates.get("web_root")
        if new_wr and os.path.isdir(new_wr):
            app.config["WEB_ROOT"] = new_wr
            app.config["SHARE_OK"] = True
            sync_cache(new_wr)
        # Trigger startup sync if sync_target is now configured
        if cfg.get("sync_target") and cfg.get("user_id"):
            try:
                import sync
                sync.startup_sync(cfg, db_path)
            except Exception:
                pass
        return jsonify({"ok": True})

    # --- /api/day/{date} ---
    def _master_rows_to_blocks(rows):
        """Convert master DB rows (JDN dates, unix timestamps) to UI blocks."""
        blocks = []
        for i, r in enumerate(rows):
            ts = r.get("time")
            start = db.unix_to_time(ts) if isinstance(ts, int) else None
            end = None
            if r.get("e_time") and start:
                try:
                    parts = r["e_time"].split(":")
                    mins = int(parts[0]) * 60 + int(parts[1])
                    if mins > 0:
                        h, m = int(start.split(":")[0]), int(start.split(":")[1])
                        total = h * 60 + m + mins
                        end = f"{total // 60:02d}:{total % 60:02d}"
                except (ValueError, IndexError):
                    pass
            job = r.get("job", "")
            btype = _normalize_job(job)
            is_marker = btype in ("clock_in", "clock_out", "eod")
            blocks.append({
                "id": r.get("uid") or f"master_{i}",
                "type": btype,
                "subtype": None,
                "device": r.get("device") if r.get("device") else None,
                "qty": int(r["qty"]) if r.get("qty") and str(r["qty"]).strip() else None,
                "start": start,
                "end": None if is_marker else end,
                "memo": r.get("memo") if r.get("memo") else None,
                "_reconstructed": True
            })
        return blocks

    @app.route("/api/day/<date_iso>", methods=["GET"])
    def get_day(date_iso):
        draft = db.get_draft(date_iso, db_path)
        if draft:
            return jsonify(draft)
        # Local TimeLogTable (has 60-day cache from remote user DB)
        user_id = cfg.get("user_id", "")
        jdn = db.iso_to_jdn(date_iso)
        rows = db.get_timelog_by_jdn(user_id, jdn, db_path)
        if rows:
            blocks = _master_rows_to_blocks(rows)
            return jsonify({"date": date_iso, "blocks": blocks, "posted": True, "posted_at": None, "reconstructed": True})
        return jsonify({"date": date_iso, "blocks": [], "posted": False, "posted_at": None})

    @app.route("/api/day/<date_iso>", methods=["POST"])
    def save_day(date_iso):
        data = request.get_json(force=True)
        blocks = data.get("blocks", [])
        db.save_draft(date_iso, blocks, db_path)
        return jsonify({"ok": True})

    @app.route("/api/day/<date_iso>", methods=["DELETE"])
    def delete_day(date_iso):
        db.delete_draft(date_iso, db_path)
        return jsonify({"ok": True})

    # --- /api/status ---
    @app.route("/api/status", methods=["GET"])
    def status():
        db_ok = False
        row_count = 0
        try:
            conn = db.get_db(db_path)
            row_count = conn.execute("SELECT COUNT(*) FROM TimeLogTable").fetchone()[0]
            conn.close()
            db_ok = True
        except Exception:
            pass

        config_complete = all(cfg.get(k) for k in ("user_id", "target_workbook", "web_root"))
        return jsonify({
            "share_reachable": app.config["SHARE_OK"],
            "db_ok": db_ok,
            "config_complete": config_complete,
            "timelog_rows": row_count,
            "offline_mode": not app.config["SHARE_OK"]
        })

    # --- /api/recents/{type} ---
    @app.route("/api/recents/<job_type>", methods=["GET"])
    def get_recents(job_type):
        conn = db.get_db(db_path)
        rows = conn.execute(
            "SELECT DISTINCT memo FROM TimeLogTable WHERE job = ? AND memo IS NOT NULL AND memo != '' ORDER BY date DESC LIMIT 20",
            (job_type,)
        ).fetchall()
        conn.close()
        return jsonify([r[0] for r in rows])

    # --- /api/memos — manage saved descriptions ---
    @app.route("/api/memos", methods=["GET"])
    def get_all_memos():
        """Return all saved memos grouped by type."""
        conn = db.get_db(db_path)
        rows = conn.execute(
            "SELECT DISTINCT job, memo FROM TimeLogTable WHERE memo IS NOT NULL AND memo != '' ORDER BY job, memo"
        ).fetchall()
        conn.close()
        result = {}
        for r in rows:
            result.setdefault(r[0], []).append(r[1])
        return jsonify(result)

    @app.route("/api/memos", methods=["POST"])
    def add_memo():
        """Add a saved memo by inserting a placeholder row."""
        data = request.get_json(force=True)
        job_type = data.get("type", "")
        memo = data.get("memo", "").strip()
        if not job_type or not memo:
            return jsonify({"error": "type and memo required"}), 400
        conn = db.get_db(db_path)
        # Check if already exists
        existing = conn.execute(
            "SELECT 1 FROM TimeLogTable WHERE job = ? AND memo = ? LIMIT 1", (job_type, memo)
        ).fetchone()
        if not existing:
            uid = f"memo_{job_type}_{memo[:20]}_{int(__import__('time').time())}"
            conn.execute(
                "INSERT INTO TimeLogTable (uid, date, job, time, e_time, memo) VALUES (?, ?, ?, ?, ?, ?)",
                (uid, "01/01/2000", job_type, "00:00", "00:00", memo)
            )
            conn.commit()
        conn.close()
        return jsonify({"ok": True})

    @app.route("/api/memos", methods=["DELETE"])
    def delete_memo():
        """Remove all rows with a specific job+memo combo (clears it from recents)."""
        data = request.get_json(force=True)
        job_type = data.get("type", "")
        memo = data.get("memo", "").strip()
        if not job_type or not memo:
            return jsonify({"error": "type and memo required"}), 400
        conn = db.get_db(db_path)
        conn.execute("DELETE FROM TimeLogTable WHERE job = ? AND memo = ?", (job_type, memo))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})

    # --- /api/post/{date} ---
    @app.route("/api/post/<date_iso>", methods=["POST"])
    def post_day_endpoint(date_iso):
        import post
        import sync
        wr = _get_web_root()
        shared = {}
        if wr:
            shared_path = os.path.join(wr, "shared_config.json")
            if os.path.isfile(shared_path):
                with open(shared_path) as f:
                    shared = json.load(f)
        result = post.post_day(date_iso, cfg, shared, db_path)
        # Sync to master on successful post
        if result.get('ok'):
            user_id = cfg.get("user_id", "")
            jdn = db.iso_to_jdn(date_iso)
            rows = db.get_timelog_by_jdn(user_id, jdn, db_path)
            if rows:
                ok, err = sync.append_to_master(cfg, rows)
                result['master_synced'] = ok
                if err:
                    result['master_error'] = err
            sync.sync_user_db(cfg, db_path)
        status_code = 200 if result.get('ok') else 400
        return jsonify(result), status_code

    # --- /api/open-target ---
    @app.route("/api/open-target", methods=["POST"])
    def open_target():
        target = cfg.get("target_workbook")
        if not target or not os.path.isfile(target):
            return jsonify({"error": "Target workbook not found"}), 404
        os.startfile(target)
        return jsonify({"ok": True})

    # --- /api/calendar/{year}/{month} ---
    @app.route("/api/calendar/<int:year>/<int:month>", methods=["GET"])
    def get_calendar(year, month):
        import calendar as cal_mod
        conn = db.get_db(db_path)
        days = {}
        prefix = f"{year}-{month:02d}-"
        drafts = conn.execute(
            "SELECT date, blocks, posted FROM DayDraft WHERE date LIKE ?", (prefix + '%',)
        ).fetchall()
        for row in drafts:
            d = row["date"]
            blocks = json.loads(row["blocks"]) if row["blocks"] else []
            if row["posted"]:
                days[d] = "posted"
            elif any(b.get("type") == "clock_out" for b in blocks):
                days[d] = "complete"
            else:
                days[d] = "draft"
        # Check local TimeLogTable (JDN format)
        user_id = cfg.get("user_id", "")
        _, days_in_month = cal_mod.monthrange(year, month)
        for day in range(1, days_in_month + 1):
            iso = f"{year}-{month:02d}-{day:02d}"
            if iso in days:
                continue
            jdn = db.iso_to_jdn(iso)
            rows = conn.execute(
                "SELECT 1 FROM TimeLogTable WHERE uid LIKE ? AND date = ? AND uid NOT LIKE 'v-%' LIMIT 1",
                (f"{user_id}_%", jdn)
            ).fetchone()
            if rows:
                days[iso] = "history"
        conn.close()
        return jsonify({"year": year, "month": month, "days": days})

    # --- /api/history ---
    @app.route("/api/history", methods=["GET"])
    def get_history():
        from_date = request.args.get("from", "2000-01-01")
        to_date = request.args.get("to", "2099-12-31")
        rows = db.get_timelog_range(from_date, to_date, db_path)
        return jsonify(rows)

    # --- /api/browse (native file dialog) ---
    @app.route("/api/browse", methods=["POST"])
    def browse():
        data = request.get_json(force=True)
        browse_type = data.get("type", "folder")
        title = data.get("title", "Select")
        initial_dir = data.get("initial_dir")
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            kwargs = {"title": title}
            if initial_dir and os.path.isdir(initial_dir):
                kwargs["initialdir"] = initial_dir
            if browse_type == "file":
                filetypes = data.get("filetypes", [["All", "*.*"]])
                kwargs["filetypes"] = filetypes
                path = filedialog.askopenfilename(**kwargs)
            else:
                path = filedialog.askdirectory(**kwargs)
            root.destroy()
            return jsonify({"path": path or None})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # --- /api/browse/files (list workbook files in a folder) ---
    @app.route("/api/browse/files", methods=["POST"])
    def browse_files():
        data = request.get_json(force=True)
        folder = data.get("path", "")
        if not folder or not os.path.isdir(folder):
            return jsonify({"error": "Folder not found", "files": []}), 404
        exts = ('.xlsm', '.xlsx')
        files = [f for f in os.listdir(folder) if f.lower().endswith(exts)]
        return jsonify({"files": files, "path": folder})

    # --- /api/workbook/sheets ---
    @app.route("/api/workbook/sheets", methods=["GET"])
    def workbook_sheets():
        path = request.args.get("path")
        if not path or not os.path.isfile(path):
            return jsonify({"error": "Workbook not found", "sheets": []}), 404
        try:
            from openpyxl import load_workbook as lw
            wb = lw(path, read_only=True, keep_vba=True)
            sheets = wb.sheetnames
            wb.close()
            return jsonify({"sheets": sheets})
        except Exception as e:
            return jsonify({"error": str(e), "sheets": []}), 500

    # --- /api/shutdown ---
    # --- /api/save (sync to remote user backup, no Excel/master) ---
    @app.route("/api/save", methods=["POST"])
    def save_sync():
        import sync
        sync.sync_user_db(cfg, db_path)
        return jsonify({"ok": True})

    # --- /api/rates ---
    @app.route("/api/rates", methods=["POST"])
    def get_rates():
        import post
        data = request.get_json(force=True)
        blocks = data.get("blocks", [])
        wr = _get_web_root()
        shared = {}
        if wr:
            shared_path = os.path.join(wr, "shared_config.json")
            if os.path.isfile(shared_path):
                with open(shared_path) as f:
                    shared = json.load(f)
        schedule = cfg.get("schedule")
        report = post.calculate_report(blocks, shared, schedule)
        return jsonify(report)

    # --- /api/rates/week ---
    @app.route("/api/rates/week", methods=["POST"])
    def get_rates_week():
        import post
        from datetime import date as _date, timedelta
        data = request.get_json(force=True)
        # Accept a date (any day in the week) — find Mon-Fri
        ref_date = data.get("date", _date.today().isoformat())
        d = _date.fromisoformat(ref_date)
        monday = d - timedelta(days=d.weekday())
        wr = _get_web_root()
        shared = {}
        if wr:
            shared_path = os.path.join(wr, "shared_config.json")
            if os.path.isfile(shared_path):
                with open(shared_path) as f:
                    shared = json.load(f)
        schedule = cfg.get("schedule")
        user_id = cfg.get("user_id", "")

        days = []
        for i in range(5):
            day_iso = (monday + timedelta(days=i)).isoformat()
            # Get blocks for this day (same logic as get_day)
            draft = db.get_draft(day_iso, db_path)
            if draft and draft.get("blocks"):
                blocks = draft["blocks"]
            else:
                jdn = db.iso_to_jdn(day_iso)
                rows = db.get_timelog_by_jdn(user_id, jdn, db_path)
                blocks = _master_rows_to_blocks(rows) if rows else []
            report = post.calculate_report(blocks, shared, schedule) if blocks else None
            days.append({"date": day_iso, "blocks": blocks, "report": report})

        # Aggregate week totals
        week_totals = {"total_quota_hours": 0, "available_prod_hours": 0, "adjusted_prod_hours": 0,
                       "non_asset_hours": 0, "off_clock_excess_mins": 0, "devices": {}}
        synopses = []
        for day in days:
            r = day.get("report")
            if not r:
                continue
            t = r["totals"]
            week_totals["total_quota_hours"] += t["total_quota_hours"]
            week_totals["available_prod_hours"] += t["available_prod_hours"]
            week_totals["adjusted_prod_hours"] += t["adjusted_prod_hours"]
            week_totals["non_asset_hours"] += t["non_asset_hours"]
            week_totals["off_clock_excess_mins"] += t["off_clock_excess_mins"]
            for dev in r["devices"]:
                did = dev["device"]
                if did not in week_totals["devices"]:
                    week_totals["devices"][did] = {"display": dev["display"], "qty": 0, "quota": dev["quota"], "quota_hrs": 0}
                week_totals["devices"][did]["qty"] += dev["qty"]
                week_totals["devices"][did]["quota_hrs"] += dev["quota_hrs"]
            if r.get("synopsis"):
                synopses.append({"date": day["date"], "synopsis": r["synopsis"]})

        week_totals["overall_pct"] = round(week_totals["total_quota_hours"] / week_totals["available_prod_hours"] * 100, 1) if week_totals["available_prod_hours"] > 0 else 0
        week_totals["adjusted_pct"] = round(week_totals["total_quota_hours"] / week_totals["adjusted_prod_hours"] * 100, 1) if week_totals["adjusted_prod_hours"] > 0 else 0
        # Round accumulated floats
        for k in ("total_quota_hours", "available_prod_hours", "adjusted_prod_hours", "non_asset_hours"):
            week_totals[k] = round(week_totals[k], 2)

        return jsonify({"week_of": monday.isoformat(), "days": days, "totals": week_totals, "synopses": synopses})

    # --- /api/sync ---
    @app.route("/api/sync", methods=["POST"])
    def sync_to_master():
        """Manual trigger: sync today's posted rows to master."""
        import sync
        from datetime import date as _date
        today = _date.today().isoformat()
        user_id = cfg.get("user_id", "")
        jdn = db.iso_to_jdn(today)
        # Get today's rows from local DB
        rows = db.get_timelog_by_jdn(user_id, jdn, db_path)
        if not rows:
            return jsonify({"ok": True, "msg": "Nothing to sync"})
        ok, err = sync.append_to_master(cfg, rows)
        if ok:
            return jsonify({"ok": True, "msg": f"Synced {len(rows)} rows to master"})
        return jsonify({"ok": False, "error": err}), 500

    @app.route("/api/sync/pull", methods=["POST"])
    def sync_pull():
        """Manual trigger: pull data from remote user DB on share into local."""
        import sync
        ok, err = sync.startup_sync(cfg, db_path)
        if ok:
            return jsonify({"ok": True, "msg": "Pulled data from share"})
        return jsonify({"ok": False, "error": err or "Sync failed"}), 500

    @app.route("/api/shutdown", methods=["POST"])
    def shutdown():
        # Sync to master and remote user DB on shutdown
        import sync
        from datetime import date as _date
        user_id = cfg.get("user_id", "")
        today = _date.today().isoformat()
        jdn = db.iso_to_jdn(today)
        rows = db.get_timelog_by_jdn(user_id, jdn, db_path)
        if rows:
            sync.append_to_master(cfg, rows)
        sync.sync_user_db(cfg, db_path)
        # Shutdown Flask (browser closes itself via window.close in JS)
        import threading
        threading.Thread(target=lambda: (os._exit(0))).start()
        return jsonify({"ok": True})

    # --- /api/reset/{level} ---
    @app.route("/api/reset/<level>", methods=["POST"])
    def reset(level):
        from pathlib import Path
        from bootstrap import sync_cache
        base = Path(db_path).parent

        # Always refresh cache if share is reachable
        wr = _get_web_root()
        if wr:
            sync_cache(wr)

        if level == "refresh":
            return jsonify({"ok": True, "msg": "Cache refreshed. Reloading..."})
        elif level == "settings":
            cfg_path = base / "config.json"
            if cfg_path.exists():
                cfg_path.unlink()
            return jsonify({"ok": True, "msg": "Settings reset. Restart to re-run setup."})
        elif level == "factory":
            import shutil
            for item in ["config.json", "timelog.db", "daybuilder.log"]:
                p = base / item
                if p.exists():
                    p.unlink()
            cache_p = base / "cache"
            if cache_p.exists():
                shutil.rmtree(cache_p)
            return jsonify({"ok": True, "msg": "Factory reset complete. Restart the app."})
        return jsonify({"error": "Invalid level. Use refresh|settings|factory"}), 400

    # --- Helper: reconstruct blocks from TimeLogTable rows ---
    def _rows_to_blocks(rows):
        """Best-effort reconstruction of blocks from legacy timelog rows."""
        blocks = []
        for i, r in enumerate(rows):
            start = _12h_to_24h(r.get("time", ""))
            block = {
                "id": r.get("uid") or f"legacy_{i}",
                "type": _normalize_job(r.get("job")),
                "subtype": None,
                "device": r.get("device") if r.get("device") else None,
                "qty": int(r["qty"]) if r.get("qty") else None,
                "start": start,
                "end": None,
                "memo": r.get("memo") if r.get("memo") else None,
                "_reconstructed": True
            }
            # Calculate end from elapsed
            if r.get("e_time") and start:
                mins = _elapsed_to_min(r["e_time"])
                if mins > 0:
                    h, m = int(start.split(":")[0]), int(start.split(":")[1])
                    total = h * 60 + m + mins
                    block["end"] = f"{total // 60:02d}:{total % 60:02d}"
            blocks.append(block)
        return blocks

    def _normalize_job(job):
        """Map legacy job names to current block types."""
        if not job:
            return "admin"
        j = job.lower().strip()
        mapping = {
            "asset processing": "asset_processing", "asset_proc": "asset_processing",
            "project": "project", "admin": "admin", "meeting": "meeting",
            "5s": "5s", "learning": "learning", "break": "break", "lunch": "lunch",
            "clock in": "clock_in", "clock_in": "clock_in",
            "clock out": "clock_out", "clock_out": "clock_out"
        }
        return mapping.get(j, j.replace(" ", "_"))

    def _12h_to_24h(t):
        """H:MM:SS AM/PM → HH:MM"""
        if not t:
            return None
        try:
            parts = t.strip().split()
            time_part = parts[0]
            ampm = parts[1] if len(parts) > 1 else "AM"
            h, m = int(time_part.split(":")[0]), int(time_part.split(":")[1])
            if ampm.upper() == "PM" and h != 12:
                h += 12
            elif ampm.upper() == "AM" and h == 12:
                h = 0
            return f"{h:02d}:{m:02d}"
        except (ValueError, IndexError):
            return None

    def _elapsed_to_min(e):
        """H:MM:SS → minutes"""
        try:
            parts = e.split(":")
            return int(parts[0]) * 60 + int(parts[1])
        except (ValueError, IndexError):
            return 0

    return app
