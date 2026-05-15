# DayBuilder — Build Path (v2)

## Agent Instructions

You are building this application from scratch. The working directory is `c:\localspace_laptop\DayBuilder\`. Start at **Phase 1** in the Build Phases section and work sequentially. Ask clarifying questions if a spec is ambiguous rather than guessing.

### What already exists in this directory:
- `bridereporter4/` — VBA source code for the legacy BridgeReporter app (the system being replaced). Contains `datatransfer.bas` which is the canonical reference for how data posts to the target workbook. **Do not modify these files.**
- `archive/` — Design conversation transcripts and prior document versions. Contains `INDEX.md` with quick-lookup tables for cell references, quotas, and paths. **Reference only.**
- `buildpath.md` — This file. The complete specification.

### Key external references:
- Legacy timelog.db (schema reference): `c:\localspace_laptop\myTardis\RMAJobLogger_v3\timelog.db`
- Target workbook example: `W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering\RAD1\RAD1 RMA Reporting\Tech Reports\Charles.xlsm`
- Shared POST directory: `W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering\RAD1\RMAJobLogger\POST`
- These paths are examples only — the app discovers them at runtime via config.

### Build output locations:
- **Local (per-user):** `C:\localspace_laptop\DayBuilder\` — bootstrap exe, config, DB, logs
- **Shared (all users):** A network share TBD — web UI files, shared_config.json, version.json
- For development, create a `web/` subfolder locally to simulate the share.

---

## What Is This

A guided daily activity logger for warehouse IT technicians. Replaces both **Tardis** (the old PySide6 time tracker) and **BridgeReporter** (the Excel report generator) with a single, modern, editable day-builder UI that posts directly to the manager's shared weekly spreadsheet.

---

## Core Philosophy

- The day is a **mutable canvas**, not an append-only log
- Everything is editable until you post — and even after, you can re-post
- The UI should feel like building a picture of your day, not filling out a form
- Guided entry: the app asks you questions, you tap answers
- No guardrails that can't be overridden — techs hate guardrails
- Dark mode, big buttons, happy fonts, RADscout palette

---

## Architecture

### Hybrid: Bootstrap Exe + Shared Web UI + Local DB

```
W:\...\DayBuilder\web\               ← SHARED (read-only for users)
    index.html                        ← single-page app
    css/app.css                       ← dark mode, RADscout palette
    js/app.js                         ← timeline, guided entry, API calls
    js/timeline.js                    ← draggable/resizable block engine
    js/post.js                        ← post-to-log logic
    assets/                           ← icons, fonts
    shared_config.json                ← device types, paths, quotas (all users)
    version.json                      ← cache-busting version tag

C:\localspace_laptop\DayBuilder\     ← LOCAL (per-user)
    bootstrap.exe                     ← PyInstaller'd Python (~100 lines)
    config.json                       ← user settings (see below)
    timelog.db                        ← SQLite (same schema as legacy)
    backup/                           ← auto-backups before post
    cache/                            ← local copy of web assets (offline fallback)
    daybuilder.log                    ← application log
```

### Why This Split

| Concern | Solution |
|---------|----------|
| Easy to update UI | Edit files on share, users get it next launch |
| Hard to break for end user | They only touch bootstrap.exe |
| Per-user data | Local SQLite + config.json |
| No server/hosting needed | Flask runs localhost, serves shared static files |
| Backup/recovery | Local backup/ folder, trivial to restore |
| Offline resilience | Local cache/ mirrors share; serves last-known-good if share is down |

### Cache Busting

The shared web folder includes `version.json`:
```json
{ "version": "1.0.0", "updated": "2025-01-14T12:00:00Z" }
```

On launch, bootstrap reads `version.json` from the share and compares to the cached copy. If different:
- Copy fresh web assets to local `cache/`
- Append `?v=1.0.0` to the HTML URL so the browser doesn't serve stale files

---

## Shared Reference Data (`shared_config.json`)

Lives on the network share alongside the web files. All users read from this — changes propagate to everyone on next launch.

```json
{
  "version": 2,
  "device_types": [
    { "id": "ZebraMC", "display": "Zebra MC", "row": 7 },
    { "id": "ZebraTC", "display": "Zebra TC", "row": 8 },
    { "id": "PC", "display": "PC", "row": 9 },
    { "id": "Avery6140", "display": "Avery 6140", "row": 10 },
    { "id": "ZebraZD", "display": "Zebra ZD", "row": 11 },
    { "id": "ZebraZQLn", "display": "Zebra ZQLn", "row": 12 },
    { "id": "ZebraZT", "display": "Zebra ZT", "row": 13 },
    { "id": "Honeywell", "display": "Honeywell", "row": 14 },
    { "id": "PointMobile", "display": "Point Mobile", "row": 15 },
    { "id": "ZebraRing", "display": "Zebra Ring", "row": 16 },
    { "id": "RTV_Events", "display": "RTV Events", "row": 17 },
    { "id": "Prov_Events", "display": "Prov Events", "row": 18 }
  ],
  "asset_paths": [
    { "id": "RTV", "display": "RTV", "counts_toward": ["RTV_Events"] },
    { "id": "Returns_Liq", "display": "Returns (Liq)", "counts_toward": [] },
    { "id": "Returns_Decom", "display": "Returns (Decom)", "counts_toward": [] },
    { "id": "RMA_PTS", "display": "RMA-PTS", "counts_toward": [] }
  ],
  "quotas": {
    "ZebraMC": 10,
    "ZebraTC": 18,
    "PC": 1,
    "Avery6140": 11,
    "ZebraZD": 8,
    "ZebraZQLn": 8,
    "ZebraZT": 1,
    "Honeywell": 10,
    "PointMobile": 1,
    "ZebraRing": 15,
    "RTV_Events": 35,
    "Prov_Events": 20
  }
}
```

The `row` field is the exact row number in the target workbook where that device type's productivity count is written. Quotas are per-device hourly rates used for compliance % calculations.

To update device types, paths, or quotas: edit this file on the share. All users pick up changes on next launch.

---

## config.json (per-user)

```json
{
  "user_id": "chrlsim",
  "user_display_name": "Charles",
  "timezone": "America/Chicago",
  "target_workbook": "W:\\Team Spaces\\...\\Tech Reports\\Charles.xlsm",
  "target_sheet": "Charles",
  "web_root": "W:\\Team Spaces\\...\\DayBuilder\\web",
  "sync_target": "W:\\Team Spaces\\...\\RMAJobLogger\\POST",
  "db_path": "timelog.db",
  "port": 5150,
  "schedule": {
    "default_start": "07:00",
    "default_end": "16:30",
    "break_count": 2,
    "break_minutes": 15,
    "lunch_minutes": 30
  }
}
```

No device types, no asset paths, no recent-items lists. Those come from `shared_config.json` and DB queries respectively.

**First-run experience (two tiers):**

*Tier 1 — Native (before web UI can load):*
1. Bootstrap exe detects missing/incomplete `config.json`
2. Opens a native OS file dialog (tkinter): "Select the DayBuilder shared folder"
3. User navigates to the shared `web/` directory on the network drive
4. `web_root` is saved to `config.json` — Flask can now start

*Tier 2 — Web-based setup wizard (served from shared files):*
1. Browser opens to `/setup`
2. Enter your user ID (login)
3. Browse to your target workbook (.xlsm) — via a server-side file picker API
4. Confirm your sheet name (app reads sheet names from the workbook, suggests match)
5. Set your sync target path (default: sibling of web_root)
6. Confirm/adjust default schedule (start time, end time, break/lunch durations)
7. Done — full config saved, redirects to `/today`

On subsequent launches, if `config.json` is complete, the app skips setup and goes straight to the day view.

---

## Database Schema

### TimeLogTable (unchanged from legacy)

```sql
CREATE TABLE TimeLogTable (
    uid TEXT PRIMARY KEY,       -- "{user_id}_{seq}_{unix_timestamp}"
    date DATE,                  -- "MM/DD/YYYY" (legacy format, kept for compatibility)
    job TEXT,                   -- task category
    time TIME,                  -- timestamp "HH:MM:SS AM/PM"
    e_time TIME,               -- elapsed time "H:MM:SS"
    memo TEXT,                  -- free text
    device TEXT,               -- device type (nullable)
    qty INT                    -- quantity (nullable)
);
```

This is the existing schema from `timelog.db`. We keep it exactly as-is so historical data works without migration.

### UID Generation

- `seq` = row order within the day (0-based, assigned at flatten time based on block order)
- `unix_timestamp` = time of POST (not time of block creation)
- On re-post: DELETE all rows for that date, then INSERT fresh rows with new UIDs. Avoids deduplication complexity.

### Date Format Standardization

- **DayDraft** uses ISO format (`YYYY-MM-DD`) internally
- **TimeLogTable** uses legacy format (`MM/DD/YYYY`) for backward compatibility
- Conversion happens at the boundary:
  - Flattening DayDraft → TimeLogTable: convert `YYYY-MM-DD` to `MM/DD/YYYY`
  - Reading TimeLogTable for display: convert `MM/DD/YYYY` to `YYYY-MM-DD`
- **The API always speaks ISO dates.** The legacy format is an internal storage detail only.

### DayDraft (new table)

The "day canvas" is stored as a JSON array of blocks representing the *working draft* before it's committed to TimeLogTable:

```sql
CREATE TABLE IF NOT EXISTS DayDraft (
    date TEXT PRIMARY KEY,     -- "YYYY-MM-DD"
    blocks TEXT,               -- JSON array of block objects
    posted INTEGER DEFAULT 0,  -- 0=draft, 1=posted
    posted_at TEXT             -- ISO timestamp of last post
);
```

Each block:
```json
{
  "id": "uuid",
  "type": "asset_processing|project|admin|5s|meeting|learning|break|lunch|clock_in|clock_out",
  "subtype": "RTV|Returns (Liq)|...",
  "device": "ZebraTC",
  "qty": 4,
  "start": "07:00",
  "end": "09:15",
  "memo": "replaced batteries on tc57s",
  "order": 0
}
```

**One device per block.** If you worked on 3× ZebraTC and 2× ZebraMC in one session, that's two blocks. Simpler aggregation, simpler UI.

When you **post**, the blocks are flattened into TimeLogTable rows (for historical compatibility) AND written to the target workbook.

---

## Flask API Contract

All endpoints return JSON. Errors return `{"error": "message", "code": "ERROR_CODE"}`.

```
GET  /api/config              → merged config (user + shared)
POST /api/config              → update user config.json fields
GET  /api/day/{date}          → DayDraft blocks for date (YYYY-MM-DD)
POST /api/day/{date}          → save DayDraft blocks for date
DELETE /api/day/{date}        → clear draft for date
POST /api/post/{date}         → validate, flatten to TimeLogTable, write workbook, sync DB
GET  /api/history?from=&to=   → TimeLogTable rows for date range
GET  /api/recents/{type}      → recent projects/admin/meetings (from DB, last 90 days)
GET  /api/workbook/sheets     → sheet names from target workbook (for setup)
POST /api/browse              → opens native file dialog, returns selected path
POST /api/open-target         → os.startfile() on target workbook
GET  /api/status              → health check (share reachable? DB ok? config complete?)
POST /api/reset/{level}       → soft|hard|full reset
```

### Recent Items

`/api/recents/{type}` queries TimeLogTable directly:
- `SELECT DISTINCT memo FROM TimeLogTable WHERE job = '{type}' ORDER BY date DESC LIMIT 20`
- Returns the last 20 unique entries for that task type, sorted by most recent
- No config.json storage needed — it's always fresh from the DB

---

## Target Workbook Post Format

Must exactly replicate what `datatransfer.bas` does today.

### Explicit Row Mapping (13 productivity values)

| Target Row | Device Type | What's Written |
|---|---|---|
| 7 | ZebraMC | Total qty processed for this device today |
| 8 | ZebraTC | " |
| 9 | PC | " |
| 10 | Avery6140 | " |
| 11 | ZebraZD | " |
| 12 | ZebraZQLn | " |
| 13 | ZebraZT | " |
| 14 | Honeywell | " |
| 15 | PointMobile | " |
| 16 | ZebraRing | " |
| 17 | RTV Events | Count of RTV-path blocks (event count, not device qty) |
| 18 | Prov Events | Count of provisioning-path blocks |
| 19 | (reserved) | Write 0 |

**Additional rows:**
| Target Row | Data | Source |
|---|---|---|
| 22 | Total working hours | Clock in to clock out minus breaks/lunch (decimal hours) |
| 23 | Total non-working hours | Breaks + lunch (decimal hours) |

**Comment cells by day:**
- Monday → B26
- Tuesday → B28
- Wednesday → B30
- Thursday → B32
- Friday → B34

**Day-to-column mapping:**
- Monday → Column B
- Tuesday → Column C
- Wednesday → Column D
- Thursday → Column E
- Friday → Column F

**Unmapped device types:** If a tech logs a device type that doesn't have a row mapping in `shared_config.json`, it gets mentioned in the comment but does NOT write to a productivity row. The app warns but does not block.

### Re-Post Behavior

When re-posting a day that was previously posted:
- **TimeLogTable:** DELETE all rows WHERE date = that date for this user, then INSERT new rows with fresh UIDs. Clean slate.
- **Target workbook:** Overwrite the day's column in place (same cells). The backup taken before write preserves the previous state.
- **DayDraft:** Update `posted = 1`, `posted_at = now()`

### Safety (Post Operation Order)

Pseudo-transactional — ordered to minimize damage on failure:

1. Validate blocks (pre-post checks pass)
2. Flatten blocks → TimeLogTable rows (in memory only)
3. Backup target workbook to `backup/` with timestamp
4. Write to target workbook (openpyxl)
5. **If workbook write succeeds** → commit TimeLogTable rows to SQLite
6. **If workbook write fails** → show error, do NOT write to SQLite, do NOT mark as posted
7. **If SQLite write fails after workbook success** → show warning "Posted to workbook but local DB update failed — will retry on next post"
8. Sync local DB to shared drive (best-effort, non-blocking)
9. Report success/failure to user

---

## Error Handling & Offline Strategy

### Network Share Unreachable

- On launch, bootstrap checks if `web_root` is accessible
- **If YES:** serve from share (normal), also copy web assets to local `cache/`
- **If NO:** serve from local `cache/` (last-known-good). Show banner: "⚠ Offline mode — some features unavailable"
- **Offline mode disables:** POST to workbook, sync to shared DB, setup wizard file browsing
- **Offline mode allows:** viewing/editing day drafts, viewing history (local DB)

### Target Workbook Locked

- Before writing, attempt to open with openpyxl
- If fails (file locked): retry 2× with 2-second delay
- If still fails: show error "Target workbook is open in Excel or locked by another user. Close it and try again." with a Retry button
- NEVER silently fail or corrupt

### General Error Display

All errors surface in the UI as dismissible toast notifications with enough detail to troubleshoot. Critical failures (can't read DB, can't start Flask) show a native error dialog from the bootstrap exe.

---

## Logging & Diagnostics

- Bootstrap exe writes to `daybuilder.log` in the local folder
- Log level: INFO by default, DEBUG via `--debug` flag or Settings toggle
- **Logs:** app start/stop, API calls (method + path + status code), errors with tracebacks, post attempts (success/fail), sync attempts
- **Rotation:** keep last 5 files, max 5MB each
- `/api/status` returns: config completeness, share reachability, DB row count, last post date, last sync date

---

## UI Structure

### Main View: The Day Timeline

```
┌──────────────────────────────────────────────────────────────┐
│  ☀ Tuesday, Jan 14 2025              [chrlsim]   [⚙] [📋]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  07:00 ┃██████████████████████████████┃ CLOCK IN             │
│  07:00 ┃  Asset Proc · RTV · TC · x4  ┃ ← drag edges        │
│        ┃  "replaced batteries"         ┃                     │
│  09:15 ┃──────────────────────────────┃                      │
│        ┃  Meeting · "IT Roundtable"    ┃                     │
│  09:45 ┃──────────────────────────────┃                      │
│        ┃  Asset Proc · RMA-PTS · MC x2 ┃                     │
│  11:00 ┃──────────────────────────────┃                      │
│        ┃  Break (15m)                  ┃                      │
│  11:15 ┃──────────────────────────────┃                      │
│        ┃  ...                          ┃                      │
│  16:30 ┃██████████████████████████████┃ CLOCK OUT            │
│                                                              │
│  [ + Add Activity ]                                          │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  TOT: 9.5h | Prod: 7.25h | Break: 1h | Admin: 1.25h        │
│  ⚠ Missing: 2nd break                                       │
│                                                              │
│  [ POST TO LOG ]          [ Report ]  [ Open Target ]        │
└──────────────────────────────────────────────────────────────┘
```

### Header Buttons

- **⚙ (Settings):** Opens Settings panel — change target workbook, sheet name, schedule defaults, sync target path, view app/share version, access Reset options, toggle debug logging
- **📋 (Clipboard):** Copies the current day's report summary to clipboard (for pasting into chat/email)

### Guided Add Flow

Tap **[ + Add Activity ]** → modal/panel slides in:

**Step 1: What kind of work?**
```
[ Asset Processing ]  [ Project ]  [ Admin ]
[ Meeting ]  [ 5S ]  [ Learning ]
[ Break ]  [ Lunch ]
```

**Step 2 (Asset Processing): Which path?**
```
[ RTV ]  [ Returns (Liq) ]  [ Returns (Decom) ]  [ RMA-PTS ]
```

**Step 3: Which device?** (grid of big buttons)
```
[ZebraMC] [ZebraTC] [  PC  ]
[Avery  ] [ZebraZD] [ ZQLn ]
[ZebraZT] [Honeywell] [Ring]
[ + other ]
```

**Step 4: How many?** (number pad)
```
[ 1 ] [ 2 ] [ 3 ]
[ 4 ] [ 5 ] [ 6 ]
[ 7 ] [ 8 ] [ 9 ]
[   ] [ 0 ] [ ✓ ]
```

**Step 5: Time?** (flexible — pick your style)
```
○ "About how long?"     [ 2h 15m ]
○ "Started at / ended at"  [09:15] → [11:30]
○ "Place after previous block"  (auto-calculates)
```

**Step 6: Memo** (optional, free text)

→ Block appears on timeline. Done.

**For Project / Admin / Meeting:**
- Show last 20 unique entries (sorted by frequency, from `/api/recents/{type}`)
- [ + New ] at bottom
- One tap to select, then time + memo

**Any task can optionally attach device + qty** (not just asset processing).

---

## Block Time Model

### Source of Truth

Each block has explicit `start` and `end` times (HH:MM, 24hr format). These are the canonical values.

### During Entry (three input styles, all resolve to explicit start/end)

| Style | Behavior |
|-------|----------|
| "About how long" (duration) | Placed after the last block's end time; end = start + duration |
| "Started at / ended at" | Used directly as start and end |
| "Place after previous" | start = previous block's end; end = unset until user sets duration or drags to resize |

### Drag/Resize Rules

- Resizing a block changes only THAT block's start or end. Adjacent blocks do NOT auto-shift.
- This can create **gaps** or **overlaps**.
- **Gaps** show as highlighted "unaccounted time" strips in the timeline.
- **Overlaps** show as a red warning indicator.
- The user resolves gaps/overlaps manually (this is the "no guardrails" philosophy).
- Pre-post validation flags gaps and overlaps as ⚠️ warnings but does not block posting if overridden.

---

## Editing

- **Click a block** → inline edit popover (change any field)
- **Drag top/bottom edge** → resize (change start/end time)
- **Drag the block body** → reorder (times auto-adjust)
- **Right-click / long-press** → Delete, Split, Duplicate
- **Undo/Redo** → standard Ctrl+Z/Y, unlimited within session (array state management)

---

## Pre-Post Validation

Before POST is enabled, the app checks:

| Check | Status |
|-------|--------|
| Clock in time set | ✅ or ❌ |
| Clock out time set | ✅ or ❌ |
| 2× breaks (≥15m each) | ✅ or ⚠️ |
| 1× lunch (≥30m) | ✅ or ⚠️ |
| No time gaps | ✅ or ⚠️ (shows where) |
| All times explicit | ✅ or ❌ |

- ❌ = blocks POST button (hard requirement)
- ⚠️ = shows warning but allows override (soft requirement)

---

## Historical Data & Day Navigation

- Date picker in the header lets you view/edit any previous day
- The app reads from local `timelog.db` for past dates
- If a day has been posted, it shows as "Posted ✓" but remains editable (re-post overwrites)
- Unposted past days show as drafts (if DayDraft exists) or can be reconstructed from TimeLogTable rows
- Future: pull from shared drive DB for cross-user reporting (nice-to-have)

---

## Report View

A secondary view (tab or modal) that shows the day in the "brief" format:
- Productivity table (device × qty × time)
- Time breakdown (production, admin, breaks)
- Schedule compliance (in/out vs expected)
- Full comment/narrative field

Exportable as PDF or clipboard copy.

---

## "Open Target" Button

Opens the manager's shared workbook directly in Excel via `os.startfile()`. This lets the user:
- Review what's been posted
- Use the manager's "Clear" button
- Verify data

---

## Tech Stack

| Layer | Technology |
|-------|-----------:|
| Bootstrap exe | Python 3.x, PyInstaller |
| Local server | Flask (lightweight, single-file) |
| Database | SQLite3 (stdlib) |
| Excel write | openpyxl |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Timeline | Custom JS (drag/resize via pointer events) |
| Styling | CSS custom properties, RADscout palette |

### Why no framework?

- Runs from a share drive — no npm, no build step
- Single HTML file + a few JS modules = trivial to update
- No dependencies to break
- Any dev can read/edit it

---

## Color Palette (from RADscout)

```css
:root {
  --bg-deep:      #02090f;
  --bg-header:    #123d52;
  --bg-card:      #1a2a35;
  --bg-surface:   #1e3a4a;
  --text-primary: #e8f4f8;
  --text-muted:   #8ab4c7;
  --accent:       #3498db;
  --accent-hover: #2980b9;
  --success:      #27ae60;
  --warning:      #f39c12;
  --danger:       #e74c3c;
  --border:       #2c4a5a;
}
```

---

## Shared DB Sync

Existing sync target: `W:\...\RMAJobLogger\POST\`
(Path stored in `config.json` as `sync_target` — not hardcoded)

Convention already in place: `{user_id}_timelog.db` per user.

**Sync behavior:**

| Event | Action |
|-------|--------|
| After successful POST | Copy local `timelog.db` → `{sync_target}/{user_id}_timelog.db` |
| App close (if dirty) | Same as above |
| App launch | Compare local vs shared timestamp. If shared is newer, prompt: "Your shared DB is newer — sync from shared?" (handles multi-machine scenario) |

**No contention:** Each user writes only their own file. WorkDocs file-level locking is irrelevant since no two users touch the same DB.

**Historical reporting (future):** Any user (or a reporting tool) can read ALL `*_timelog.db` files from this directory to build cross-team reports.

---

## Build Phases

### Phase 1: Foundation ✅ COMPLETE
- [x] Project structure on local + share
- [x] `bootstrap.py` — launches Flask, opens browser, handles offline detection
- [x] `config.json` schema + Tier 1 native setup (file dialog for web_root)
- [x] Flask API: CRUD for day blocks (`/api/day/{date}`, `/api/config`, `/api/status`)
- [x] SQLite layer: read/write TimeLogTable + DayDraft
- [x] Basic HTML shell with dark mode styling

### Phase 2: Timeline UI ✅ COMPLETE
- [x] Render blocks as a vertical timeline
- [x] Click to edit (popover)
- [x] Drag to resize (pointer events)
- [x] Drag to reorder
- [x] Add/delete blocks
- [x] Undo/redo (array state)
- [x] Gap/overlap visualization

### Phase 3: Guided Entry ✅ COMPLETE
- [x] "Add Activity" modal flow
- [x] Asset Processing path (path → device → qty → time → memo)
- [x] Project/Admin/Meeting with recent-items list (from `/api/recents`)
- [x] Break/Lunch/5S quick-add
- [x] Optional device+qty attachment on any task

### Phase 4: Post & Report ✅ COMPLETE
- [x] Pre-post validation UI
- [x] openpyxl write to target workbook (with backup, retry, error handling)
- [x] Flatten blocks → TimeLogTable rows on post (with re-post delete+reinsert)
- [x] Shared DB sync after post
- [x] "Open Target" button
- [x] Report view (brief-style summary)
- [x] Clipboard export (via report modal)

### Phase 5: Polish & Deploy ✅ COMPLETE
- [x] Tier 2 web-based setup wizard (`/setup` route — user ID, target workbook browse, sheet select, schedule)
- [x] Historical day navigation (date picker in header, load any past day)
- [x] Offline mode (serve from cache, limited functionality, banner)
- [x] Cache busting (version.json comparison on launch, `?v=` param)
- [x] Logging (file rotation already in bootstrap.py — add debug toggle in Settings)
- [x] Settings panel (⚙) — change target workbook, sheet, schedule, sync path, view version, reset options
- [x] Exit button in UI — calls `/api/shutdown`, Flask shuts down gracefully, syncs dirty DB, releases memory
- [x] Version number displayed in Settings/Help screen (reads from `version.json`)
- [x] GitHub repo — ✅ DONE (https://github.com/shalmanassar/DayBuilder)
- [x] PyInstaller build for bootstrap.exe
- [x] Deploy web files to share
- [ ] Test with second user (different target workbook)
- **Done when:** a second user on a different machine can complete full setup and post to their own target

---

## Current File Map (for new agents)

```
C:\localspace_laptop\DayBuilder\
├── bootstrap.py        ← Entry point: logging, config load, Tier 1 setup (tkinter), offline detect, cache busting, starts Flask
├── app.py              ← Flask app factory. Routes: /, /setup, /api/config, /api/day/{date}, /api/status, /api/recents/{type}, /api/post/{date}, /api/open-target, /api/history, /api/browse, /api/workbook/sheets, /api/shutdown, /api/reset/{level}
├── db.py               ← SQLite layer: init_db, get/save/delete_draft, get/insert/delete timelog rows, date format helpers
├── post.py             ← Post logic: validate_blocks, flatten_blocks, aggregate_productivity, calculate_hours, build_comment, backup_workbook, write_workbook, sync_db, post_day
├── daybuilder.spec     ← PyInstaller one-file spec for bootstrap.exe
├── deploy.py           ← Deploy script: bumps version, copies web/ to network share
├── .gitignore          ← Excludes: timelog.db, config.json, backup/, cache/, *.exe, __pycache__, logs
├── README.md
├── buildpath.md        ← This file (full spec)
├── verify_phase*.py    ← Test scripts for each phase
├── archive/            ← Design docs (reference only, do not modify)
├── bridereporter4/     ← Legacy VBA source (reference only, do not modify)
├── backup/             ← Auto-created on post (workbook backups)
├── cache/              ← Auto-created on launch (offline fallback copy of web/)
└── web/                ← Simulated shared folder (serves as Flask static root)
    ├── index.html      ← SPA shell: header with date nav, timeline container, footer with POST/Report/Open Target
    ├── setup.html      ← Tier 2 web-based setup wizard (5 steps)
    ├── shared_config.json  ← Device types, asset paths, quotas (all users read this)
    ├── version.json    ← Cache-busting version tag
    ├── css/app.css     ← RADscout dark palette, timeline blocks, guided modal, validation, report, settings, toast styles
    ├── js/app.js       ← Main wiring: loads status, inits Timeline, date nav, binds Guided/Post/Report/Settings buttons, auto-save
    ├── js/timeline.js  ← Timeline engine: render, edit popover, drag resize/reorder, undo/redo, gap/overlap
    ├── js/guided.js    ← Guided entry modal: type→path→device→qty→time→memo flow, recents, quick-add
    ├── js/post.js      ← Client-side validation, POST button logic, toast notifications
    ├── js/report.js    ← Report modal: productivity table, time breakdown, clipboard copy
    ├── js/settings.js  ← Settings panel: config editing, version display, reset, debug toggle, exit
    └── assets/         ← (empty, for future icons/fonts)
```

### Key implementation notes for Phase 5:
- `bootstrap.py` already has: RotatingFileHandler (5MB x 5 files), `--debug` flag, tkinter Tier 1 setup, cache sync via shutil.copytree
- `app.py` serves static files from `web_root` via `send_from_directory`; the `/` route serves `index.html`
- Config is loaded once at startup into a dict (`cfg`) passed to `create_app()`; updates write to `config.json` via `/api/config POST`
- The `web/` folder is the local dev stand-in for the network share; `web_root` in config points to it
- Flask runs on port 5150 (configurable in config.json)
- All JS modules are IIFEs exposing a global object (Timeline, Guided, Post, Report)
- No build tools, no npm — vanilla JS served directly from the share

---

## Uninstall / Reset

The bootstrap exe supports a `--reset` flag (or a "Reset" button in Settings):

| Mode | What it does |
|------|-------------|
| **Soft reset** | Deletes `config.json` only. Next launch triggers first-run setup again. DB untouched. |
| **Hard reset** | Deletes `config.json` + `DayDraft` table (working drafts). Preserves `TimeLogTable` (historical data). |
| **Full uninstall** | Deletes the entire local folder (`config.json`, `timelog.db`, `backup/`, `cache/`). User is back to zero. |

**How it works:**
- From the web UI: Settings → Reset → pick level → confirm ("Are you sure? This cannot be undone.")
- From command line: `bootstrap.exe --reset soft|hard|full`
- Full uninstall offers to export `timelog.db` to a chosen location before deletion

---

## Migration Path

1. Deploy DayBuilder alongside existing Tardis/BridgeReporter (no disruption)
2. Users opt-in by running bootstrap.exe
3. Historical data in `timelog.db` is immediately visible
4. Old tools remain functional until team is comfortable
5. Eventually retire Tardis + BridgeReporter

---

*Last updated: 2025-04-03*
*Author: chrlsim + Claude*
*Version: 2 (all evaluation items addressed)*
