# Kiro CLI Build Prompt — DayBuilder Manager Phase 1

## Context

You are building Phase 1 of the DayBuilder Manager utility. Read `d:\DayBuilder\manager\buildpath_manager.md` for the full specification. Read `d:\DayBuilder\buildpath.md` for the parent application's architecture (you share data stores and design patterns with it).

The parent app (DayBuilder) is a working Flask + vanilla JS application at `d:\DayBuilder\`. Study its patterns in `bootstrap.py`, `app.py`, `db.py` for reference — the manager utility follows the same conventions.

## What to Build (Phase 1: Foundation)

Build these files in `d:\DayBuilder\manager\`:

### 1. `manager.py` — Entry point
- Flask server on port 5151
- Open browser on launch (same pattern as `../bootstrap.py`)
- Load/save `manager_config.json`
- First-run detection: if config missing, serve embedded setup HTML
- Embedded setup page: browse for RMAJobLogger folder, browse for Tech Reports folder(s), manager name (pre-filled from `os.getlogin()`)
- Logging with RotatingFileHandler (same as parent)
- Graceful shutdown via `/api/shutdown`

### 2. `manager_app.py` — Flask app factory
- Serve static files from `manager_web/`
- If config incomplete, serve embedded setup page
- Implement these endpoints:
  - `GET /api/status` — share reachable, master DB row count, employee count, last import timestamp
  - `GET /api/config` — return manager_config.json + employees.json + shared_config.json merged
  - `POST /api/config` — update manager_config.json fields
  - `GET /api/employees` — list from employees.json
  - `GET /api/employees/{user_id}` — single employee + basic stats from master DB
  - `POST /api/employees` — add employee to employees.json
  - `PUT /api/employees/{user_id}` — update employee fields
  - `DELETE /api/employees/{user_id}` — set active=false
  - `POST /api/browse` — native file dialog (same as parent app)
  - `POST /api/shutdown` — graceful exit

### 3. `governance.py` — Shared config + employee registry CRUD
- `load_employees(path)` / `save_employees(path, data)` — atomic write (temp + rename)
- `load_shared_config(path)` / `save_shared_config(path, data)` — atomic write + version increment
- `discover_employees(rma_path, tech_reports_paths)` — scan `POST/*.db` + `Tech Reports/*.xlsm`, return suggested roster
- Helper: `get_employee(user_id)`, `add_employee(emp)`, `update_employee(user_id, fields)`, `deactivate_employee(user_id)`

### 4. `manager_web/index.html` — SPA shell
- Sidebar nav: Dashboard, Employees, Devices, Activities, Reports, Settings
- Content area (swapped by JS based on nav selection)
- RADscout dark mode palette (copy CSS variables from parent's `web/css/app.css`)
- Title bar: "DayBuilder Manager" + user display + Exit button
- For Phase 1: Dashboard shows "Loading..." placeholder, Employees view shows the roster table

### 5. `manager_web/css/manager.css` — Styles
- RADscout palette (same `:root` variables as parent)
- Sidebar layout (fixed left, content right)
- Table styles for employee list
- Card styles for dashboard (placeholder)
- Form styles for setup page

### 6. `manager_web/js/app.js` — Main wiring
- Fetch `/api/config` on load
- Nav click handlers (show/hide sections)
- Load employees list into table
- Setup redirect if config incomplete

### 7. `manager_web/js/employee.js` — Employee list + basic CRUD
- Render employee table (name, user_id, workbook path, participant status, active)
- Add employee form (modal or inline)
- Edit employee (click row → edit form)
- Deactivate button with confirm

## Key Patterns to Follow

- **Embedded setup HTML** in `manager.py` as a string literal (same as `../bootstrap.py` `SETUP_HTML`)
- **Flask app factory** pattern: `create_app(cfg, ...)` returns the app (same as `../app.py`)
- **Atomic file writes**: write to `{path}.tmp`, then `os.replace(tmp, path)`
- **No npm, no build tools** — vanilla JS, IIFEs, served directly
- **Port 5151** (DayBuilder uses 5150)
- **SQLite reads** use `sqlite3.connect(path, timeout=10)` with `row_factory = sqlite3.Row`

## Do NOT Build Yet

- `importer.py` (Phase 2)
- `reports.py` (Phase 3)
- Dashboard data (Phase 3)
- Device/Activity governance UI (Phase 4)
- Any workbook read/write logic (Phase 2)

## Verification

After building, running `python manager.py` should:
1. Open browser to `http://localhost:5151`
2. Show setup page (first run) OR dashboard shell (if config exists)
3. Setup flow: browse for folders → save config → redirect to main UI
4. Main UI: sidebar nav works, employees table loads from employees.json
5. `/api/status` returns valid JSON with share reachability check
