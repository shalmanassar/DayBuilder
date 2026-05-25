# Build State — DayBuilder Manager

## Build Target
DayBuilder Manager utility — Phase 1: Foundation
See `manager/buildpath_manager.md` for full specification.

## Overall Progress
- [ ] Phase 1: Foundation (manager.py, manager_app.py, governance.py, web UI shell)
- [ ] Phase 2: Workbook Import (importer.py)
- [ ] Phase 3: Consolidated Reporting (reports.py, dashboard)
- [ ] Phase 4: Device/Activity Governance UI

## Completed Tasks
(none yet)

## Current Master Assignment
**Awaiting HAIC assignment.**

## Current Minion Task
**Awaiting Master assignment.**

## Minion Output
(none yet)

## Last Master Report
(none yet)

## Task Queue (Phase 1)
1. `manager/manager.py` — Entry point: Flask on 5151, browser launch, embedded setup HTML
2. `manager/manager_app.py` — Flask app factory, API routes (status, config, employees, browse, shutdown)
3. `manager/governance.py` — Employee CRUD, shared config CRUD, atomic writes
4. `manager/manager_web/index.html` — SPA shell with sidebar nav
5. `manager/manager_web/css/manager.css` — RADscout dark mode styles
6. `manager/manager_web/js/app.js` — Main wiring, nav, config loading
7. `manager/manager_web/js/employee.js` — Employee list + CRUD UI

## Architecture Notes
- Port 5151 (parent app uses 5150)
- Same tech stack: Flask + vanilla JS + SQLite + openpyxl
- Embedded setup HTML pattern (same as parent bootstrap.py)
- Atomic file writes: write to .tmp, os.replace
- RADscout dark mode palette (copy CSS vars from parent)
- Read-only access to per-user DBs, write to master DB with lock protocol
