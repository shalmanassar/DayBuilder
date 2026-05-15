"""Flask application factory for DayBuilder API."""
import json
import os
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
        return send_from_directory(web_root, "index.html")

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
        return jsonify({"user": cfg, "shared": shared})

    @app.route("/api/config", methods=["POST"])
    def update_config():
        updates = request.get_json(force=True)
        cfg.update(updates)
        from bootstrap import CONFIG_PATH, save_config
        save_config(cfg)
        return jsonify({"ok": True})

    # --- /api/day/{date} ---
    @app.route("/api/day/<date_iso>", methods=["GET"])
    def get_day(date_iso):
        draft = db.get_draft(date_iso, db_path)
        if draft:
            return jsonify(draft)
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

    return app
