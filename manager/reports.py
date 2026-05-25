"""Consolidated report generation — reads master DB, aggregates by employee/date/device."""
import sqlite3
from datetime import date, timedelta
from pathlib import Path

import governance


def _master_db_path(cfg):
    return Path(cfg["rma_job_logger_path"]) / "POST" / "m_timelog.db"


def _date_to_jdn(d):
    a = (14 - d.month) // 12
    y = d.year + 4800 - a
    m = d.month + 12 * a - 3
    return d.day + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045


def _jdn_to_date(jdn):
    a = jdn + 32044
    b = (4 * a + 3) // 146097
    c = a - (146097 * b) // 4
    d_ = (4 * c + 3) // 1461
    e = c - (1461 * d_) // 4
    m = (5 * e + 2) // 153
    day = e - (153 * m + 2) // 5 + 1
    month = m + 3 - 12 * (m // 10)
    year = 100 * b + d_ - 4800 + m // 10
    return date(year, month, day)


def _get_quotas(cfg):
    """Load quotas from shared_config. Returns {device_id: default_quota}."""
    sc = governance.load_shared_config(cfg)
    quotas = {}
    for device_id, paths in sc.get("quotas", {}).items():
        # Use first path's quota as default
        if paths:
            quotas[device_id] = list(paths.values())[0] if isinstance(paths, dict) else paths
    return quotas


def _get_device_display(cfg):
    """Map device_id -> display name."""
    sc = governance.load_shared_config(cfg)
    return {dt["id"]: dt.get("display", dt["id"]) for dt in sc.get("device_types", [])}


def _get_schedule_hours(employee):
    """Calculate available production hours from employee schedule."""
    sched = employee.get("schedule", {})
    start = sched.get("default_start", "08:00")
    end = sched.get("default_end", "16:30")
    sh, sm = map(int, start.split(":"))
    eh, em = map(int, end.split(":"))
    total_min = (eh * 60 + em) - (sh * 60 + sm)
    breaks = sched.get("break_count", 2) * sched.get("break_minutes", 15)
    lunch = sched.get("lunch_minutes", 30)
    return (total_min - breaks - lunch) / 60.0


def _query_db(cfg, sql, params=()):
    db = _master_db_path(cfg)
    if not db.exists():
        return []
    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _user_id_from_uid(uid):
    """Extract user_id from UID. Format: {user_id}_{seq}_{ts} or {user_id}_imp_{jdn}_{row}_{ts}."""
    parts = uid.split("_")
    if len(parts) >= 3 and parts[1] == "imp":
        return parts[0]
    return parts[0] if parts else uid


def daily_report(cfg, target_date):
    """All employees' data for a single date. Returns per-employee device counts + totals."""
    if isinstance(target_date, str):
        target_date = date.fromisoformat(target_date)
    jdn = _date_to_jdn(target_date)

    rows = _query_db(cfg,
        "SELECT uid, device, qty FROM TimeLogTable WHERE date=? AND uid NOT LIKE 'v-%'",
        (jdn,))

    employees_data = governance.load_employees(cfg)
    emp_map = {e["user_id"]: e for e in employees_data.get("employees", []) if e.get("active", True)}
    quotas = _get_quotas(cfg)

    # Aggregate by user
    by_user = {}
    for r in rows:
        uid = _user_id_from_uid(r["uid"])
        by_user.setdefault(uid, {})
        dev = r["device"]
        by_user[uid][dev] = by_user[uid].get(dev, 0) + r["qty"]

    results = []
    team_devices = {}
    for user_id, emp in emp_map.items():
        devices = by_user.get(user_id, {})
        total_qty = sum(devices.values())
        # Production % calc
        hours = _get_schedule_hours(emp)
        prod_pct = 0
        if hours > 0 and quotas:
            weighted = sum(qty / quotas.get(dev, 18) for dev, qty in devices.items())
            prod_pct = round((weighted / hours) * 100, 1)

        for dev, qty in devices.items():
            team_devices[dev] = team_devices.get(dev, 0) + qty

        results.append({
            "user_id": user_id,
            "display_name": emp.get("display_name", user_id),
            "devices": devices,
            "total_qty": total_qty,
            "production_pct": prod_pct,
            "has_data": bool(devices)
        })

    return {
        "date": target_date.isoformat(),
        "employees": results,
        "team_totals": team_devices,
        "team_total_qty": sum(team_devices.values())
    }


def weekly_report(cfg, target_date):
    """Full Mon-Fri report for the week containing target_date."""
    if isinstance(target_date, str):
        target_date = date.fromisoformat(target_date)
    monday = target_date - timedelta(days=target_date.weekday())

    days = []
    week_totals = {}
    for offset in range(5):
        day = monday + timedelta(days=offset)
        report = daily_report(cfg, day)
        days.append(report)
        for dev, qty in report["team_totals"].items():
            week_totals[dev] = week_totals.get(dev, 0) + qty

    # Per-employee weekly summary
    employees_data = governance.load_employees(cfg)
    emp_map = {e["user_id"]: e for e in employees_data.get("employees", []) if e.get("active", True)}
    quotas = _get_quotas(cfg)

    emp_weekly = []
    for user_id, emp in emp_map.items():
        week_devices = {}
        for day_report in days:
            for e in day_report["employees"]:
                if e["user_id"] == user_id:
                    for dev, qty in e["devices"].items():
                        week_devices[dev] = week_devices.get(dev, 0) + qty
        total_qty = sum(week_devices.values())
        hours = _get_schedule_hours(emp) * 5
        prod_pct = 0
        if hours > 0 and quotas:
            weighted = sum(qty / quotas.get(dev, 18) for dev, qty in week_devices.items())
            prod_pct = round((weighted / hours) * 100, 1)
        emp_weekly.append({
            "user_id": user_id,
            "display_name": emp.get("display_name", user_id),
            "devices": week_devices,
            "total_qty": total_qty,
            "production_pct": prod_pct
        })

    return {
        "week_of": monday.isoformat(),
        "days": days,
        "employee_summaries": emp_weekly,
        "team_totals": week_totals,
        "team_total_qty": sum(week_totals.values())
    }


def employee_report(cfg, user_id, from_date, to_date):
    """Single employee's data for a date range."""
    if isinstance(from_date, str):
        from_date = date.fromisoformat(from_date)
    if isinstance(to_date, str):
        to_date = date.fromisoformat(to_date)

    jdn_from = _date_to_jdn(from_date)
    jdn_to = _date_to_jdn(to_date)

    rows = _query_db(cfg,
        "SELECT uid, date, device, qty FROM TimeLogTable WHERE date BETWEEN ? AND ? AND uid LIKE ? AND uid NOT LIKE 'v-%'",
        (jdn_from, jdn_to, f"{user_id}_%"))

    emp = governance.get_employee(cfg, user_id)
    quotas = _get_quotas(cfg)
    hours_per_day = _get_schedule_hours(emp) if emp else 7.0

    # Group by date
    by_date = {}
    for r in rows:
        d = r["date"]
        by_date.setdefault(d, {})
        by_date[d][r["device"]] = by_date[d].get(r["device"], 0) + r["qty"]

    days = []
    for jdn in range(jdn_from, jdn_to + 1):
        d = _jdn_to_date(jdn)
        if d.weekday() >= 5:  # skip weekends
            continue
        devices = by_date.get(jdn, {})
        total_qty = sum(devices.values())
        prod_pct = 0
        if hours_per_day > 0 and quotas and devices:
            weighted = sum(qty / quotas.get(dev, 18) for dev, qty in devices.items())
            prod_pct = round((weighted / hours_per_day) * 100, 1)
        days.append({
            "date": d.isoformat(),
            "devices": devices,
            "total_qty": total_qty,
            "production_pct": prod_pct
        })

    return {
        "user_id": user_id,
        "display_name": emp.get("display_name", user_id) if emp else user_id,
        "from": from_date.isoformat(),
        "to": to_date.isoformat(),
        "days": days
    }


def device_report(cfg, device_id, from_date, to_date):
    """Device-specific production across all employees for date range."""
    if isinstance(from_date, str):
        from_date = date.fromisoformat(from_date)
    if isinstance(to_date, str):
        to_date = date.fromisoformat(to_date)

    jdn_from = _date_to_jdn(from_date)
    jdn_to = _date_to_jdn(to_date)

    rows = _query_db(cfg,
        "SELECT uid, date, qty FROM TimeLogTable WHERE date BETWEEN ? AND ? AND device=? AND uid NOT LIKE 'v-%'",
        (jdn_from, jdn_to, device_id))

    by_user = {}
    by_date = {}
    for r in rows:
        uid = _user_id_from_uid(r["uid"])
        by_user[uid] = by_user.get(uid, 0) + r["qty"]
        d = r["date"]
        by_date[d] = by_date.get(d, 0) + r["qty"]

    daily = []
    for jdn in range(jdn_from, jdn_to + 1):
        d = _jdn_to_date(jdn)
        if d.weekday() >= 5:
            continue
        daily.append({"date": d.isoformat(), "qty": by_date.get(jdn, 0)})

    return {
        "device_id": device_id,
        "from": from_date.isoformat(),
        "to": to_date.isoformat(),
        "by_employee": by_user,
        "daily": daily,
        "total": sum(by_user.values())
    }


def dashboard(cfg, target_date=None):
    """Team overview for today/selected date."""
    if target_date is None:
        target_date = date.today()
    elif isinstance(target_date, str):
        target_date = date.fromisoformat(target_date)

    report = daily_report(cfg, target_date)
    device_display = _get_device_display(cfg)

    # Enrich with display names for devices
    team_devices_display = []
    for dev_id, qty in sorted(report["team_totals"].items(), key=lambda x: -x[1]):
        team_devices_display.append({
            "id": dev_id,
            "display": device_display.get(dev_id, dev_id),
            "qty": qty
        })

    return {
        "date": target_date.isoformat(),
        "employees": report["employees"],
        "team_devices": team_devices_display,
        "team_total_qty": report["team_total_qty"]
    }
