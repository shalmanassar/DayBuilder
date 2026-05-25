"""Governance module — CRUD for employees.json and shared_config.json with atomic writes."""
import json
import os
from pathlib import Path


def _employees_path(cfg):
    return Path(cfg["rma_job_logger_path"]) / "DayBuilder" / "employees.json"


def _shared_config_path(cfg):
    return Path(cfg["rma_job_logger_path"]) / "DayBuilder" / "web" / "shared_config.json"


def _atomic_write(path, data):
    """Write JSON to path.tmp then os.replace for atomicity."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


def load_employees(cfg):
    p = _employees_path(cfg)
    if p.exists():
        with open(p) as f:
            return json.load(f)
    return {"employees": []}


def save_employees(cfg, data):
    _atomic_write(_employees_path(cfg), data)


def get_employee(cfg, user_id):
    data = load_employees(cfg)
    for emp in data["employees"]:
        if emp.get("user_id") == user_id:
            return emp
    return None


def add_employee(cfg, employee_data):
    data = load_employees(cfg)
    data["employees"].append(employee_data)
    save_employees(cfg, data)
    return employee_data


def update_employee(cfg, user_id, updates):
    data = load_employees(cfg)
    for emp in data["employees"]:
        if emp.get("user_id") == user_id:
            emp.update(updates)
            save_employees(cfg, data)
            return emp
    return None


def deactivate_employee(cfg, user_id):
    return update_employee(cfg, user_id, {"active": False})


def load_shared_config(cfg):
    p = _shared_config_path(cfg)
    if p.exists():
        with open(p) as f:
            return json.load(f)
    return {"version": 1, "device_types": [], "asset_paths": [], "quotas": {}}


def save_shared_config(cfg, data):
    data["version"] = data.get("version", 0) + 1
    _atomic_write(_shared_config_path(cfg), data)


# --- Device governance ---

def get_devices(cfg):
    sc = load_shared_config(cfg)
    return {"device_types": sc.get("device_types", []), "quotas": sc.get("quotas", {})}


def add_device(cfg, device):
    sc = load_shared_config(cfg)
    sc.setdefault("device_types", []).append(device)
    save_shared_config(cfg, sc)
    return device


def update_device(cfg, device_id, updates):
    sc = load_shared_config(cfg)
    for dt in sc.get("device_types", []):
        if dt.get("id") == device_id:
            dt.update(updates)
            # If quotas provided, update quotas dict
            if "quotas" in updates:
                sc.setdefault("quotas", {})[device_id] = updates.pop("quotas")
            save_shared_config(cfg, sc)
            return dt
    return None


def hide_device(cfg, device_id):
    return update_device(cfg, device_id, {"hidden": True})


def update_quotas(cfg, device_id, quotas):
    sc = load_shared_config(cfg)
    sc.setdefault("quotas", {})[device_id] = quotas
    save_shared_config(cfg, sc)
    return quotas


# --- Activity governance ---

def get_activities(cfg):
    sc = load_shared_config(cfg)
    return sc.get("asset_paths", [])


def add_activity(cfg, activity):
    sc = load_shared_config(cfg)
    sc.setdefault("asset_paths", []).append(activity)
    save_shared_config(cfg, sc)
    return activity


def update_activity(cfg, path_id, updates):
    sc = load_shared_config(cfg)
    for ap in sc.get("asset_paths", []):
        if ap.get("id") == path_id:
            ap.update(updates)
            save_shared_config(cfg, sc)
            return ap
    return None


def hide_activity(cfg, path_id):
    return update_activity(cfg, path_id, {"hidden": True})
