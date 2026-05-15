"""Flask application factory for DayBuilder API."""
import json
import os
import signal
from flask import Flask, request, jsonify, send_from_directory
import db


def create_app(cfg, web_root, db_path, share_ok):
    app = Flask(__name__, static_folder=None)
    app.config["CFG"] = cfg
    app.config["WEB_ROOT"] = web_root
    app.config["DB_PATH"] = db_path
    app.config["SHARE_OK"] = share_ok

    # --- Static file serving ---
    @app.route("/")
    def index():
        # Redirect to setup if config incomplete
        if not all(cfg.get(k) for k in ("user_id", "target_workbook")):
            return send_from_directory(web_root, "setup.html")
        return send_from_directory(web_root, "index.html")

    @app.route("/setup")
    def setup():
        return send_from_directory(web_root, "setup.html")

    @app.route("/<path:filename>")
    def static_files(filename):
        return send_from_directory(web_root, filename)

    # --- /api/config ---
    @app.route("/api/config", methods=["GET"])
    def get_config():
        shared_path = os.path.join(web_root, "shared_config.json")
        shared = {}
        if os.path.isfile(shared_path):
            with open(shared_path) as f:
                shared = json.load(f)
        # Include version info
        ver_path = os.path.join(web_root, "version.json")
        version = {}
        if os.path.isfile(ver_path):
            with open(ver_path) as f:
                version = json.load(f)
        return jsonify({"user": cfg, "shared": shared, "version": version})

    @app.route("/api/config", methods=["POST"])
    def update_config():
        updates = request.get_json(force=True)
        cfg.update(updates)
        from bootstrap import save_config
        save_config(cfg)
        return jsonify({"ok": True})

    # --- /api/day/{date} ---
    @app.route("/api/day/<date_iso>", methods=["GET"])
    def get_day(date_iso):
        draft = db.get_draft(date_iso, db_path)
        if draft:
            return jsonify(draft)
        # Try to reconstruct from TimeLogTable
        rows = db.get_timelog_rows(date_iso, db_path)
        if rows:
            blocks = _rows_to_blocks(rows)
            return jsonify({"date": date_iso, "blocks": blocks, "posted": True, "posted_at": None})
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
            "share_reachable": share_ok,
            "db_ok": db_ok,
            "config_complete": config_complete,
            "timelog_rows": row_count,
            "offline_mode": not share_ok
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

    # --- /api/post/{date} ---
    @app.route("/api/post/<date_iso>", methods=["POST"])
    def post_day_endpoint(date_iso):
        import post
        shared_path = os.path.join(web_root, "shared_config.json")
        shared = {}
        if os.path.isfile(shared_path):
            with open(shared_path) as f:
                shared = json.load(f)
        result = post.post_day(date_iso, cfg, shared, db_path)
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
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            if browse_type == "file":
                filetypes = data.get("filetypes", [["All", "*.*"]])
                path = filedialog.askopenfilename(title=title, filetypes=filetypes)
            else:
                path = filedialog.askdirectory(title=title)
            root.destroy()
            return jsonify({"path": path or None})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

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
    @app.route("/api/shutdown", methods=["POST"])
    def shutdown():
        # Sync DB if needed
        import post
        sync_target = cfg.get("sync_target")
        user_id = cfg.get("user_id")
        if sync_target and user_id:
            post.sync_db(db_path, sync_target, user_id)
        # Shutdown Flask
        func = request.environ.get("werkzeug.server.shutdown")
        if func:
            func()
        else:
            os.kill(os.getpid(), signal.SIGTERM)
        return jsonify({"ok": True})

    # --- /api/reset/{level} ---
    @app.route("/api/reset/<level>", methods=["POST"])
    def reset(level):
        from pathlib import Path
        base = Path(db_path).parent
        if level == "soft":
            cfg_path = base / "config.json"
            if cfg_path.exists():
                cfg_path.unlink()
            return jsonify({"ok": True, "msg": "Config reset. Restart to re-run setup."})
        elif level == "hard":
            cfg_path = base / "config.json"
            if cfg_path.exists():
                cfg_path.unlink()
            conn = db.get_db(db_path)
            conn.execute("DELETE FROM DayDraft")
            conn.commit()
            conn.close()
            return jsonify({"ok": True, "msg": "Config + drafts reset."})
        elif level == "full":
            import shutil
            for item in ["config.json", "timelog.db", "daybuilder.log"]:
                p = base / item
                if p.exists():
                    p.unlink()
            for d in ["backup", "cache"]:
                p = base / d
                if p.exists():
                    shutil.rmtree(p)
            return jsonify({"ok": True, "msg": "Full reset. All local data removed."})
        return jsonify({"error": "Invalid level. Use soft|hard|full"}), 400

    # --- Helper: reconstruct blocks from TimeLogTable rows ---
    def _rows_to_blocks(rows):
        """Best-effort reconstruction of blocks from legacy timelog rows."""
        blocks = []
        for i, r in enumerate(rows):
            block = {
                "id": r.get("uid", f"legacy_{i}"),
                "type": r.get("job", "admin"),
                "subtype": None,
                "device": r.get("device"),
                "qty": r.get("qty"),
                "start": _12h_to_24h(r.get("time", "")),
                "end": None,
                "memo": r.get("memo")
            }
            # Calculate end from elapsed
            if r.get("e_time") and block["start"]:
                mins = _elapsed_to_min(r["e_time"])
                h, m = int(block["start"].split(":")[0]), int(block["start"].split(":")[1])
                total = h * 60 + m + mins
                block["end"] = f"{total // 60:02d}:{total % 60:02d}"
            blocks.append(block)
        return blocks

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
