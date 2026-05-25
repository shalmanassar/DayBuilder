# Build State — DayBuilder Manager

## Build Target
DayBuilder Manager utility — Phase 4: Device/Activity Governance UI ✓ COMPLETE
See `manager/buildpath_manager.md` for full specification.

## Overall Progress
- [x] Phase 1: Foundation (manager.py, manager_app.py, governance.py, web UI shell)
- [x] Phase 2: Workbook Import (importer.py, API endpoints, auto-import)
- [x] Phase 3: Consolidated Reporting (reports.py, dashboard UI, daily/weekly endpoints)
- [x] Phase 4: Device/Activity Governance UI (devices.js, activities.js, API routes)

## Completed Tasks
### Phase 1
- `manager/manager.py` — Entry point: Flask on 5151, browser launch, embedded setup HTML (3-step)
- `manager/manager_app.py` — Flask app factory, routes: status, config, employees CRUD, browse, shutdown
- `manager/governance.py` — Atomic CRUD for employees.json and shared_config.json
- `manager/manager_config.json` — Default config template
- `manager/manager_web/index.html` — SPA shell with sidebar nav + title bar
- `manager/manager_web/css/manager.css` — RADscout dark mode full stylesheet
- `manager/manager_web/js/app.js` — Navigation, config/status loading, settings view
- `manager/manager_web/js/employee.js` — Employee list, detail, add modal, deactivate

### Phase 2
- `manager/importer.py` — Workbook reader (rows 7-19 devices, 22-23 hours, 26-34 comments)
- Device name mapping (row → system_id via shared_config.device_types)
- Week detection from file modification date (Monday of that week)
- Import UID generation: `{user_id}_imp_{jdn}_{row}_{ts}`
- Master DB lock protocol (acquire/release m_timelog.lock, backup before write)
- Discrepancy detection (DB vs workbook mismatch per user+date+device)
- Discrepancy resolution (keep_db or accept_workbook with void+re-insert)
- API endpoints: POST /api/import, POST /api/import/{user_id}, GET /api/import/status, POST /api/import/resolve
- Auto-import on launch (background thread)

### Phase 3
- `manager/reports.py` — Report generation: daily, weekly, employee, device, dashboard
- Production % calculation: sum(qty/quota) / available_hours × 100
- Schedule-aware hours calculation from employee schedule fields
- API endpoints: GET /api/dashboard, /api/report/daily/{date}, /api/report/weekly/{date}, /api/report/employee/{user_id}, /api/report/device/{device_id}
- `manager/manager_web/js/dashboard.js` — Employee cards with production %, team totals, device breakdown, date picker, import button
- Reports view: weekly/daily report generator with table output
- Employee detail view: 30-day history with per-day production %

### Phase 4
- Device governance API: GET/POST/PUT/DELETE /api/devices, /api/devices/{device_id}
- Activity governance API: GET/POST/PUT/DELETE /api/activities, /api/activities/{path_id}
- `manager/manager_web/js/devices.js` — Device table, edit view with quota JSON, add modal, hide
- `manager/manager_web/js/activities.js` — Activity table, edit view, add modal, hide
- governance.py extended: get_devices, add_device, update_device, hide_device, update_quotas, get_activities, add_activity, update_activity, hide_activity
- Atomic writes with version bump on all shared_config changes
- Validation: id required on add, not-found checks on update/delete

## Architecture Notes
- Port 5151 (parent app uses 5150)
- Same tech stack: Flask + vanilla JS + SQLite + openpyxl
- Embedded setup HTML pattern (same as parent bootstrap.py)
- Atomic file writes: write to .tmp, os.replace
- RADscout dark mode palette (CSS vars from parent)
- Read-only access to per-user DBs, write to master DB with lock protocol
- Lock protocol: os.open O_CREAT|O_EXCL for m_timelog.lock, retry with timeout
- ImportMeta table tracks what was imported and when
- _import_status module-level dict tracks running state + last result

## Next Steps (Phase 5: Advanced Reporting & Polish — future)
- Trend reports (30/60/90 day rolling averages)
- Export: CSV, XLSX
- Discrepancy resolution UI
- Error handling (share unreachable, workbook locked)
- Logging improvements
- PyInstaller spec
