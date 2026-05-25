# DayBuilder Manager — Build Path (v2)

## Agent Instructions

You are building the **DayBuilder Manager** utility — a companion application to DayBuilder (the tech-facing daily activity logger). The manager utility provides consolidated multi-employee reporting, workbook import/archival, and governance of shared resources (devices, activities, employees, paths).

**Read `../buildpath.md` first.** It contains the parent application's full architecture, database schema, API contract, and design philosophy. This utility reads from the same data stores and governs the same shared configuration.

### Working Directory
- Manager source: `d:\DayBuilder\manager\`
- Shared drive (WorkDocs): `W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering\RAD1\`
- Master DB: `{RMAJobLogger}/POST/m_timelog.db`
- Per-user DBs: `{RMAJobLogger}/POST/{user_id}_timelog.db`
- Tech Reports (WorkDocs): `{RAD1}/RAD1 RMA Reporting/Tech Reports/`
- Tech Reports (SharePoint): SharePoint-synced folder (path varies per employee)
- Shared config: `{RMAJobLogger}/DayBuilder/web/shared_config.json`
- Employees registry: `{RMAJobLogger}/DayBuilder/employees.json`

### Key Constraints
- Must NOT interfere with running DayBuilder instances
- Must respect the master DB lock-file protocol (`m_timelog.lock`)
- Read-only access to per-user DBs (never write to another user's DB)
- **NEVER write to non-participant employee workbooks**
- **NEVER write to the manager's Total Report.xlsx**
- Write to DayBuilder-participant workbooks ONLY with double-confirmation ("Are you sure?" → "Are you REALLY sure?")
- Write access to `shared_config.json` and `employees.json` (governance)
- Write access to master DB (import, consolidation) — with lock protocol
- Same tech stack as DayBuilder: Flask + vanilla HTML/CSS/JS + SQLite + openpyxl
- Same visual palette (RADscout dark mode)

---

## What Is This

A management dashboard for the warehouse IT team lead / supervisor. Replaces the manually-maintained `Total Report.xlsx` with a live consolidated view. Provides:

1. **Workbook import & consolidation** — read all employee workbooks weekly, import to master DB (the authoritative historical store)
2. **Consolidated reporting** — view all employees' productivity in one place, with history/trends/rates
3. **Employee governance** — manage the roster, assignments, schedules, workbook paths
4. **Device governance** — add/remove/edit device types, quotas, row mappings, display aliases
5. **Activity governance** — manage asset paths and activity categories

---

## Core Philosophy

- The manager sees **everyone's data** — aggregated and per-employee
- **Master DB is the historical authority** — workbooks are ephemeral (one week only)
- **Workbook import is a core function** — the manager tool consolidates all employee data into the master DB, regardless of whether they use DayBuilder
- Governance changes propagate to all DayBuilder instances on their next launch (via shared_config.json)
- No direct manipulation of employee day data — the manager can VIEW but not EDIT individual days
- **Permission tiers are strict** — see Permission Model below
- The tool is informational first, administrative second — dashboards before forms

---

## Permission Model

| Target | Read | Write | Condition |
|--------|------|-------|-----------|
| Master DB (`m_timelog.db`) | ✓ Always | ✓ Import/consolidation | Lock protocol required |
| Per-user DBs (`{user}_timelog.db`) | ✓ Always | ✗ NEVER | — |
| DayBuilder participant workbooks | ✓ Always | ✓ Double-confirm only | "Are you sure?" × 2 |
| Non-participant workbooks | ✓ Always | ✗ NEVER | — |
| Manager's Total Report.xlsx | ✗ Not needed | ✗ NEVER | Replaced by this tool |
| `shared_config.json` | ✓ Always | ✓ Governance | Atomic write + version bump |
| `employees.json` | ✓ Always | ✓ Governance | Atomic write |

**DayBuilder participant** = employee has a `{user_id}_timelog.db` on the share AND `participant: true` in employees.json.

---

## Architecture

```
d:\DayBuilder\manager\
├── manager.py              ← Entry point: Flask server on port 5151, browser launch
├── manager_app.py          ← Flask app factory, all API routes
├── reports.py              ← Consolidated report generation logic
├── governance.py           ← CRUD for employees, devices, activities
├── importer.py             ← Workbook reader + master DB import logic
├── manager_web/            ← Web UI (served by Flask)
│   ├── index.html          ← SPA shell: nav sidebar + content area
│   ├── css/manager.css     ← Styles (extends RADscout palette)
│   └── js/
│       ├── app.js          ← Main wiring, nav, data loading
│       ├── dashboard.js    ← Team overview / consolidated view
│       ├── employee.js     ← Employee detail + management
│       ├── devices.js      ← Device type governance UI
│       ├── activities.js   ← Activity/path governance UI
│       └── reports.js      ← Report generation + export
├── manager_config.json     ← Local config (paths, preferences)
└── buildpath_manager.md    ← This file
```

---

## Data Sources

### Master DB (`m_timelog.db`)

The single source of truth for ALL historical time entries across ALL employees. Schema:

```sql
CREATE TABLE TimeLogTable (
    uid TEXT PRIMARY KEY,       -- "{user_id}_{seq}_{unix_timestamp}"
    date DATE,                 -- Julian Day Number (integer)
    job TEXT,                  -- task category
    time TIME,                 -- unix timestamp (integer)
    e_time TIME,               -- elapsed time "H:MM:SS"
    memo TEXT,
    device TEXT,
    qty INT
);
```

- UIDs prefixed with `v-` are voided entries (soft-deleted) — exclude from reports
- `date` is JDN (Julian Day Number)
- `time` is unix timestamp (seconds since epoch)
- User identified by UID prefix: `{user_id}_{seq}_{ts}`
- **For imported workbook data** (non-DayBuilder users): UID format = `{user_id}_imp_{jdn}_{row}_{import_ts}`

### Per-User DBs (`{user_id}_timelog.db`)

Same schema. Contains DayBuilder users' authoritative data + `DayDraft` table for unposted work status. Manager reads these for real-time status only.

### Employee Workbooks (Two Locations)

Per-employee `.xlsm` files. Identical layout regardless of location:
- **Rows 7–19:** device productivity counts (by column per weekday)
- **Row 20:** daily total (sum of 7-19)
- **Row 22:** working hours
- **Row 23:** non-working hours
- **Rows 26/28/30/32/34:** daily comments (column B)
- **Columns:** B=Mon, C=Tue, D=Wed, E=Thu, F=Fri
- **Column G:** weekly total per device (sum B:F)

Locations:
1. WorkDocs: `W:\...\RAD1 RMA Reporting\Tech Reports\{Name}.xlsm`
2. SharePoint: varies per employee (stored in employees.json)

**These workbooks hold only the CURRENT WEEK.** Data is overwritten/cleared each Monday. The manager tool must import before it's lost.

### Device Name Mapping (Workbook ↔ System)

The workbooks use different display names than `shared_config.json`:

| Row | Workbook Label | System ID (shared_config) |
|-----|---------------|--------------------------|
| 7 | TC5x | ZebraTC |
| 8 | MC3x | ZebraMC |
| 9 | 19xx | Honeywell |
| 10 | ZQ6xx | ZebraZQLn |
| 11 | ZD62x | ZebraZD |
| 12 | ZT41x | ZebraZT |
| 13 | Laptops | Laptops |
| 14 | Avery | Avery6140 |
| 15 | RS5xxx | ZebraRing |
| 16 | DS3678 | DS3678 |
| 17 | Thinclient/Desktop | PC |
| 18 | Motorola | Motorola |
| 19 | RTV | RTV_Events |

This mapping is stored in `shared_config.json` as `workbook_aliases` (see below).

### Total Report.xlsx (Reference Only)

The manager's existing consolidation workbook. Structure:
- "Total" sheet: `=SUM(Bashar!B7, Charles!B7, ...)` per device per day
- Per-employee sheets: `=IF([n]Name!B7=0,"", [n]Name!B7)` pulling from individual workbooks
- **This tool REPLACES this workbook's function.** Never read from or write to it.

### `shared_config.json` (Updated Schema)

```json
{
  "version": 4,
  "device_types": [
    { "id": "ZebraTC", "display": "Zebra TC", "row": 7, "workbook_label": "TC5x" },
    { "id": "ZebraMC", "display": "Zebra MC", "row": 8, "workbook_label": "MC3x" },
    { "id": "Honeywell", "display": "Honeywell", "row": 9, "workbook_label": "19xx" },
    { "id": "ZebraZQLn", "display": "Zebra ZQLn", "row": 10, "workbook_label": "ZQ6xx" },
    { "id": "ZebraZD", "display": "Zebra ZD", "row": 11, "workbook_label": "ZD62x" },
    { "id": "ZebraZT", "display": "Zebra ZT", "row": 12, "workbook_label": "ZT41x" },
    { "id": "Laptops", "display": "Laptops", "row": 13, "workbook_label": "Laptops" },
    { "id": "Avery6140", "display": "Avery 6140", "row": 14, "workbook_label": "Avery" },
    { "id": "ZebraRing", "display": "Zebra Ring", "row": 15, "workbook_label": "RS5xxx" },
    { "id": "DS3678", "display": "DS3678", "row": 16, "workbook_label": "DS3678" },
    { "id": "PC", "display": "PC", "row": 17, "workbook_label": "Thinclient/Desktop" },
    { "id": "Motorola", "display": "Motorola", "row": 18, "workbook_label": "Motorola" },
    { "id": "RTV_Events", "display": "RTV Events", "row": 19, "workbook_label": "RTV", "hidden": true }
  ],
  "asset_paths": [
    { "id": "RMA_PTS", "display": "RMA / PTS", "counts_toward": [] },
    { "id": "RTV", "display": "RTV", "counts_toward": ["RTV_Events"] },
    { "id": "Returns_Liq", "display": "Liquidation", "counts_toward": [] },
    { "id": "Returns_Decom", "display": "Decom", "counts_toward": [] }
  ],
  "quotas": {
    "ZebraTC": { "RMA_PTS": 18, "RTV": 35, "Returns_Liq": 18, "Returns_Decom": 18 }
  }
}
```

New field: `workbook_label` — maps system device ID to the label used in workbook row headers. Used by the importer to match workbook data to the correct device.

### `employees.json`

```json
{
  "version": 1,
  "updated": "2026-05-23T12:00:00Z",
  "employees": [
    {
      "user_id": "chrlsim",
      "display_name": "Charles",
      "target_workbook": "W:\\...\\Tech Reports\\Charles.xlsm",
      "target_sheet": "Charles",
      "participant": true,
      "schedule": {
        "default_start": "08:00",
        "default_end": "16:30",
        "break_count": 2,
        "break_minutes": 15,
        "lunch_minutes": 30
      },
      "active": true,
      "hire_date": "2024-01-15",
      "notes": ""
    },
    {
      "user_id": "jsmith",
      "display_name": "John",
      "target_workbook": "C:\\Users\\jsmith\\SharePoint\\Daily Report\\Tech Reports\\John.xlsm",
      "target_sheet": "John",
      "participant": false,
      "schedule": {
        "default_start": "08:00",
        "default_end": "16:30",
        "break_count": 2,
        "break_minutes": 15,
        "lunch_minutes": 30
      },
      "active": true,
      "hire_date": "2023-06-01",
      "notes": "Manual entry — not on DayBuilder"
    }
  ]
}
```

Key field: **`participant`** — `true` = uses DayBuilder (has `{user_id}_timelog.db`), `false` = manual workbook entry only. Determines write permissions.

---

## manager_config.json (local)

```json
{
  "rma_job_logger_path": "W:\\Team Spaces\\RAD IT Engineering\\NA RAD IT Engineering\\RAD1\\RMAJobLogger",
  "tech_reports_paths": [
    "W:\\Team Spaces\\RAD IT Engineering\\NA RAD IT Engineering\\RAD1\\RAD1 RMA Reporting\\Tech Reports"
  ],
  "port": 5151,
  "manager_id": "chrlsim",
  "manager_name": "Charles"
}
```

Note: `tech_reports_paths` is an array — supports multiple workbook locations. Individual employee paths override this (stored in employees.json).

---

## Workbook Import (Core Feature)

### Purpose

Employee workbooks hold only the current week's data. Without import, historical data is lost every Monday. The manager tool reads workbooks and imports data into the master DB for permanent storage.

### Import Logic (`importer.py`)

```
For each active employee:
  1. Open their workbook (read-only)
  2. For each weekday column (B-F):
     a. Read device counts (rows 7-19)
     b. Read hours (rows 22-23)
     c. Read comment (rows 26/28/30/32/34)
     d. Determine the actual date (from week-of context)
     e. Check if master DB already has data for this user+date
     f. If NOT in DB: generate rows and insert (with lock)
     g. If ALREADY in DB: compare — flag discrepancies for review
  3. Report: imported N days, skipped M (already in DB), K discrepancies
```

### Import UID Format

For workbook-imported data (non-DayBuilder users):
```
{user_id}_imp_{jdn}_{device_row}_{import_timestamp}
```

Example: `jsmith_imp_2460818_7_1716500000` (John, JDN for 2026-05-22, row 7 = ZebraTC, import time)

### Import Triggers

- **On launch:** auto-scan all employee workbooks, import any new data not in master DB
- **Manual:** "Import Now" button in dashboard
- **The import NEVER overwrites existing master DB data** — it only adds what's missing

### Discrepancy Handling

If the workbook has different numbers than the master DB for the same user+date:
- Show in UI: "⚠ Discrepancy: Charles, May 22 — DB has 12 ZebraTC, workbook has 14"
- Manager decides: keep DB value (do nothing) or update DB (void old, insert new — with double-confirm for participants)

### Week Detection

Workbooks don't store dates explicitly. The import must determine which week the data represents:
- Use the workbook's file modification date as a hint
- Column B = Monday of that week, C = Tuesday, etc.
- If `last_modified` is Thursday, the data is for the week containing that Thursday
- Store `import_week_of` (Monday's date) in a metadata table for audit

---

## Flask API Contract

All endpoints return JSON. Port 5151.

### Dashboard & Reporting

```
GET  /api/dashboard                    → team overview (today/selected date, all active employees)
GET  /api/report/daily/{date}          → all employees' data for a single day
GET  /api/report/weekly/{date}         → full week (Mon-Fri) containing {date}, all employees
GET  /api/report/employee/{user_id}?from=&to= → single employee's data for date range
GET  /api/report/device/{device_id}?from=&to= → device-specific production across all employees
GET  /api/report/compliance/{date}     → schedule compliance for the week
GET  /api/report/trend/{user_id}?days= → rolling average production trend
```

### Import

```
POST /api/import                       → trigger full import scan (all employees)
POST /api/import/{user_id}             → import single employee's workbook
GET  /api/import/status                → last import results, discrepancies
POST /api/import/resolve               → resolve a discrepancy (keep DB or accept workbook value)
```

### Employee Governance

```
GET    /api/employees                  → list all employees
GET    /api/employees/{user_id}        → single employee detail + recent stats
POST   /api/employees                  → add new employee
PUT    /api/employees/{user_id}        → update employee fields
DELETE /api/employees/{user_id}        → deactivate (set active=false)
```

### Device Governance

```
GET    /api/devices                    → current device_types + quotas
POST   /api/devices                    → add new device type
PUT    /api/devices/{device_id}        → update device (display, row, quotas, workbook_label)
DELETE /api/devices/{device_id}        → hide device type
```

### Activity Governance

```
GET    /api/activities                 → current asset_paths
POST   /api/activities                 → add new asset path
PUT    /api/activities/{path_id}       → update path
DELETE /api/activities/{path_id}       → hide path
```

### Utility

```
GET  /api/status                       → health (share reachable, master DB stats, last import)
GET  /api/config                       → manager_config.json
POST /api/config                       → update manager config
POST /api/browse                       → native file dialog
POST /api/export/{format}              → generate export (csv, xlsx)
POST /api/shutdown                     → graceful exit
```

---

## UI Structure

### Navigation (Sidebar)

```
┌─────────────────────────────────────────────────────────────────┐
│ ☀ DayBuilder Manager                              [chrlsim] [✕] │
├────────────┬────────────────────────────────────────────────────┤
│            │                                                    │
│ 📊 Dashboard│  [Content area]                                   │
│ 👥 Employees│                                                    │
│ 🔧 Devices  │                                                    │
│ 📋 Activities│                                                    │
│ 📈 Reports  │                                                    │
│ ⚙ Settings │                                                    │
│            │                                                    │
│ ─────────  │                                                    │
│ Last import:│                                                    │
│ 5m ago ✓   │                                                    │
└────────────┴────────────────────────────────────────────────────┘
```

### Dashboard View

Team overview for selected date/week. Employee cards show:
- Name, status (Posted / Draft / No data / Workbook only)
- Production % (if data available)
- Clock in/out times
- Device count total

Team totals row at bottom. Device breakdown. Click card → employee detail.

### Employee Detail View

- Header: name, user_id, schedule, workbook path, participant status
- This week: daily production % + device counts
- Device breakdown with rates
- 30-day calendar heatmap (color = production %)
- Recent posts/imports list
- Edit / Deactivate buttons

### Devices View

Table: ID, Display, Row, Workbook Label, Quotas (per path). Click to edit. Usage stats (last 30 days from master DB).

### Activities View

Asset paths table + activity types list. Add/edit/hide.

### Reports View

Report type selector, date range, employee filter. Generate → table view. Export options.

---

## Report Calculations

Same model as DayBuilder's `post.calculate_report()`:
- Production % = `sum(qty / quota_per_hour)` / `available_production_hours` × 100
- For workbook-imported data (no time blocks): use employee's scheduled hours as available production hours

### Team Aggregation

- **Team daily:** sum device counts, average production %
- **Team weekly:** sum Mon–Fri all employees
- **Device breakdown:** total units per device across team
- **Compliance:** on-time clock-in count, proper breaks (DayBuilder users only — no time data for manual users)

---

## Safety & Concurrency

### Master DB Writes (Import)

- Acquire lock (`m_timelog.lock`) before any write
- Backup master DB before bulk import
- Insert only (never UPDATE existing rows)
- To correct: void old UID (`v-` prefix) + insert replacement
- Release lock immediately after

### shared_config.json Writes

- Read → modify → write to temp → atomic rename
- Increment `version` field
- Single writer assumed (manager utility)

### Double-Confirm Protocol

For any operation that writes to a DayBuilder participant's workbook:
1. First dialog: "This will update {Name}'s workbook. Continue?"
2. Second dialog: "Are you ABSOLUTELY sure? This overwrites employee-recorded data."
3. Only then proceed

This applies to: workbook corrections, re-posting on behalf of employee (future).

---

## First-Run Setup

1. Launch `manager.py` → browser opens
2. If `manager_config.json` missing → setup page:
   - "Select the RMAJobLogger folder" (browse)
   - "Select Tech Reports folder(s)" (browse, can add multiple)
   - Manager name/ID (pre-filled from `os.getlogin()`)
3. Config saved
4. If `employees.json` doesn't exist → auto-discovery:
   - Scan `POST/*.db` → extract user_ids
   - Scan Tech Reports `*.xlsm` → match names
   - Present list for manager to confirm/edit
   - Save `employees.json` to share
5. Trigger initial import (all workbooks → master DB)

---

## Build Phases

### Phase 1: Foundation
- [ ] Project structure (`manager/` directory, all files scaffolded)
- [ ] `manager.py` — entry point (Flask on 5151, browser launch, config load/save)
- [ ] `manager_config.json` schema + embedded setup page (same pattern as DayBuilder)
- [ ] `governance.py` — read/write `employees.json` and `shared_config.json` (atomic)
- [ ] Basic HTML shell with sidebar nav + RADscout dark mode
- [ ] `/api/status`, `/api/config`, `/api/employees`, `/api/browse` endpoints
- [ ] Auto-discovery of employees from existing DBs + workbooks

### Phase 2: Import & Consolidation
- [ ] `importer.py` — read workbook data (rows 7-19, 22-23, 26-34)
- [ ] Device name mapping (workbook_label → system ID via shared_config)
- [ ] Week detection from file modification date
- [ ] Import to master DB (lock, backup, insert, release)
- [ ] Import UID generation (`{user_id}_imp_{jdn}_{row}_{ts}`)
- [ ] Discrepancy detection (DB vs workbook mismatch)
- [ ] `/api/import`, `/api/import/{user_id}`, `/api/import/status` endpoints
- [ ] Auto-import on launch

### Phase 3: Dashboard & Reporting
- [ ] `reports.py` — read master DB, aggregate by employee/date/device
- [ ] Dashboard view: employee cards with status + production %
- [ ] Daily report: all employees for selected date
- [ ] Weekly report: Mon–Fri aggregation (replaces Total Report.xlsx view)
- [ ] Employee detail view with history + heatmap
- [ ] Team totals + device breakdown

### Phase 4: Governance UI
- [ ] Employee management: add/edit/deactivate + participant flag
- [ ] Device governance: add/edit/hide + workbook_label + quotas
- [ ] Activity governance: add/edit/hide asset paths
- [ ] Atomic writes with version bump
- [ ] Validation (prevent breaking shared_config structure)

### Phase 5: Advanced Reporting & Polish
- [ ] Trend report (30/60/90 day rolling averages)
- [ ] Device production over time
- [ ] Export: clipboard, CSV, XLSX
- [ ] Discrepancy resolution UI
- [ ] Error handling (share unreachable, workbook locked)
- [ ] Logging (RotatingFileHandler, same as DayBuilder)
- [ ] PyInstaller spec for manager.exe

---

## Current Employee Roster (from WorkDocs scan)

| user_id | Display Name | Workbook | Location | DB on Share | Participant |
|---------|-------------|----------|----------|-------------|-------------|
| chrlsim | Charles | Charles.xlsm | WorkDocs | ✓ | Yes |
| anmichao | Darius | Darius.xlsm | WorkDocs | ✓ | Yes |
| baskhatt | Bashar | BasharNew.xlsm | WorkDocs | ✓ | Yes |
| Ribarrer | George | George.xlsm | WorkDocs | ✓ | Yes |
| (unknown) | John | John.xlsm | WorkDocs | — | No |
| (unknown) | Doug | Doug.xlsm | WorkDocs | — | No |
| (unknown) | Michael | Michael.xlsm | WorkDocs | — | No |

Notes:
- John, Doug, Michael: manual workbook entry, not on DayBuilder
- Some employees may have workbooks on SharePoint instead of/in addition to WorkDocs
- user_ids for non-participants will be assigned during setup (e.g., login name or manual entry)

---

## Out of Scope (this version)

- Real-time notifications
- Direct editing of employee day data
- Multi-site / multi-team support
- Role-based access control (single manager assumed)
- Mobile/responsive layout
- Cloud deployment
- PDF export (CSV/XLSX only for v1)
- Workbook provisioning (creating new employee workbooks from template)
- Week rollover/clearing of workbooks (employee responsibility)

---

*Created: 2026-05-23 — chrlsim + Amazon Q*
*Version: 2 (post-interview, all findings incorporated)*
