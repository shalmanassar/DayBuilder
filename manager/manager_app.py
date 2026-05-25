"""Flask app factory for DayBuilder Manager."""
import json
import os
import signal
import threading
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, Response

import governance
import importer
import reports


# Module-level import state (shared across requests)
_import_status = {"last_result": None, "running": False}


def create_app(cfg):
    base_dir = Path(__file__).parent
    web_root = base_dir / "manager_web"
    app = Flask(__name__, static_folder=None)
    app.config["CFG"] = cfg

    # --- Static serving ---
    @app.route("/")
    def index():
        if web_root.is_dir():
            return send_from_directory(str(web_root), "index.html")
        return Response("Manager web UI not found", status=404)

    @app.route("/<path:filename>")
    def static_files(filename):
        if web_root.is_dir():
            return send_from_directory(str(web_root), filename)
        return Response("Not found", status=404)

    # --- /api/status ---
    @app.route("/api/status")
    def api_status():
        rma = cfg.get("rma_job_logger_path", "")
        share_ok = bool(rma and os.path.isdir(rma))
        emp_count = 0
        if share_ok:
            try:
                data = governance.load_employees(cfg)
                emp_count = len(data.get("employees", []))
            except Exception:
                pass
        return jsonify({"share_reachable": share_ok, "employee_count": emp_count})

    # --- /api/config ---
    @app.route("/api/config", methods=["GET"])
    def get_config():
        return jsonify(cfg)

    @app.route("/api/config", methods=["POST"])
    def update_config():
        from manager import save_config
        updates = request.get_json(force=True)
        cfg.update(updates)
        save_config(cfg)
        return jsonify({"ok": True})

    # --- /api/employees ---
    @app.route("/api/employees", methods=["GET"])
    def list_employees():
        data = governance.load_employees(cfg)
        return jsonify(data.get("employees", []))

    @app.route("/api/employees/<user_id>", methods=["GET"])
    def get_employee(user_id):
        emp = governance.get_employee(cfg, user_id)
        if not emp:
            return jsonify({"error": "not found"}), 404
        return jsonify(emp)

    @app.route("/api/employees", methods=["POST"])
    def add_employee():
        emp = request.get_json(force=True)
        result = governance.add_employee(cfg, emp)
        return jsonify(result), 201

    @app.route("/api/employees/<user_id>", methods=["PUT"])
    def update_employee(user_id):
        updates = request.get_json(force=True)
        result = governance.update_employee(cfg, user_id, updates)
        if not result:
            return jsonify({"error": "not found"}), 404
        return jsonify(result)

    @app.route("/api/employees/<user_id>", methods=["DELETE"])
    def delete_employee(user_id):
        result = governance.deactivate_employee(cfg, user_id)
        if not result:
            return jsonify({"error": "not found"}), 404
        return jsonify(result)

    # --- /api/browse ---
    @app.route("/api/browse", methods=["POST"])
    def browse():
        body = request.get_json(force=True)
        dialog_type = body.get("type", "folder")
        title = body.get("title", "Select")
        initial_dir = body.get("initial_dir", "")
        result = {"path": None}

        def _run_dialog():
            try:
                import tkinter as tk
                from tkinter import filedialog
                root = tk.Tk()
                root.withdraw()
                root.attributes("-topmost", True)
                if dialog_type == "folder":
                    path = filedialog.askdirectory(title=title, initialdir=initial_dir or None)
                else:
                    path = filedialog.askopenfilename(title=title, initialdir=initial_dir or None)
                root.destroy()
                result["path"] = path if path else None
            except Exception:
                pass

        t = threading.Thread(target=_run_dialog)
        t.start()
        t.join(timeout=120)
        return jsonify(result)

    # --- /api/devices ---
    @app.route("/api/devices", methods=["GET"])
    def list_devices():
        return jsonify(governance.get_devices(cfg))

    @app.route("/api/devices", methods=["POST"])
    def add_device():
        device = request.get_json(force=True)
        if not device.get("id"):
            return jsonify({"error": "id required"}), 400
        return jsonify(governance.add_device(cfg, device)), 201

    @app.route("/api/devices/<device_id>", methods=["PUT"])
    def update_device(device_id):
        updates = request.get_json(force=True)
        result = governance.update_device(cfg, device_id, updates)
        if not result:
            return jsonify({"error": "not found"}), 404
        return jsonify(result)

    @app.route("/api/devices/<device_id>", methods=["DELETE"])
    def hide_device(device_id):
        result = governance.hide_device(cfg, device_id)
        if not result:
            return jsonify({"error": "not found"}), 404
        return jsonify(result)

    # --- /api/activities ---
    @app.route("/api/activities", methods=["GET"])
    def list_activities():
        return jsonify(governance.get_activities(cfg))

    @app.route("/api/activities", methods=["POST"])
    def add_activity():
        activity = request.get_json(force=True)
        if not activity.get("id"):
            return jsonify({"error": "id required"}), 400
        return jsonify(governance.add_activity(cfg, activity)), 201

    @app.route("/api/activities/<path_id>", methods=["PUT"])
    def update_activity(path_id):
        updates = request.get_json(force=True)
        result = governance.update_activity(cfg, path_id, updates)
        if not result:
            return jsonify({"error": "not found"}), 404
        return jsonify(result)

    @app.route("/api/activities/<path_id>", methods=["DELETE"])
    def hide_activity(path_id):
        result = governance.hide_activity(cfg, path_id)
        if not result:
            return jsonify({"error": "not found"}), 404
        return jsonify(result)

    # --- /api/dashboard & /api/report ---
    @app.route("/api/dashboard")
    def api_dashboard():
        target = request.args.get("date")
        return jsonify(reports.dashboard(cfg, target))

    @app.route("/api/report/daily/<date_str>")
    def report_daily(date_str):
        return jsonify(reports.daily_report(cfg, date_str))

    @app.route("/api/report/weekly/<date_str>")
    def report_weekly(date_str):
        return jsonify(reports.weekly_report(cfg, date_str))

    @app.route("/api/report/employee/<user_id>")
    def report_employee(user_id):
        from_date = request.args.get("from")
        to_date = request.args.get("to")
        if not from_date or not to_date:
            return jsonify({"error": "from and to params required"}), 400
        return jsonify(reports.employee_report(cfg, user_id, from_date, to_date))

    @app.route("/api/report/device/<device_id>")
    def report_device(device_id):
        from_date = request.args.get("from")
        to_date = request.args.get("to")
        if not from_date or not to_date:
            return jsonify({"error": "from and to params required"}), 400
        return jsonify(reports.device_report(cfg, device_id, from_date, to_date))

    # --- /api/import ---
    @app.route("/api/import", methods=["POST"])
    def import_all_employees():
        if _import_status["running"]:
            return jsonify({"error": "import already running"}), 409
        _import_status["running"] = True
        try:
            result = importer.import_all(cfg)
            _import_status["last_result"] = result
        finally:
            _import_status["running"] = False
        return jsonify(result)

    @app.route("/api/import/<user_id>", methods=["POST"])
    def import_single(user_id):
        emp = governance.get_employee(cfg, user_id)
        if not emp:
            return jsonify({"error": "employee not found"}), 404
        result = importer.import_employee(cfg, emp)
        return jsonify(result)

    @app.route("/api/import/status", methods=["GET"])
    def import_status():
        return jsonify({
            "running": _import_status["running"],
            "last_result": _import_status["last_result"]
        })

    @app.route("/api/import/resolve", methods=["POST"])
    def import_resolve():
        body = request.get_json(force=True)
        user_id = body.get("user_id")
        date_str = body.get("date")
        device_id = body.get("device")
        action = body.get("action", "keep_db")
        if not all([user_id, date_str, device_id]):
            return jsonify({"error": "missing user_id, date, or device"}), 400
        result = importer.resolve_discrepancy(cfg, user_id, date_str, device_id, action)
        return jsonify(result)

    # --- /api/shutdown ---
    @app.route("/api/shutdown", methods=["POST"])
    def shutdown():
        os.kill(os.getpid(), signal.SIGTERM)
        return jsonify({"ok": True})

    return app
