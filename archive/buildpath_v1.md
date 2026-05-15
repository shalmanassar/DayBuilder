# DayBuilder — Build Path

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

C:\localspace_laptop\DayBuilder\     ← LOCAL (per-user)
    bootstrap.exe                     ← PyInstaller'd Python (~100 lines)
    config.json                       ← user settings (see below)
    timelog.db                        ← SQLite (same schema as legacy)
    backup/                           ← auto-backups before post
```

### Why This Split

| Concern | Solution |
|---------|----------|
| Easy to update UI | Edit files on share, users get it next launch |
| Hard to break for end user | They only touch bootstrap.exe |
| Per-user data | Local SQLite + config.json |
| No server/hosting needed | Flask runs localhost, serves shared static files |
| Backup/recovery | Local backup/ folder, trivial to restore |

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
  "db_path": "timelog.db",
  "port": 5150,
  "schedule": {
    "default_start": "07:00",
    "default_end": "16:30",
    "break_count": 2,
    "break_minutes": 15,
    "lunch_minutes": 30
  },
  "recent_projects": [],
  "recent_admin": [],
  "device_types": [
    "ZebraMC", "ZebraTC", "PC", "Avery6140",
    "ZebraZD", "ZebraZQLn", "ZebraZT",
    "Honeywell", "PointMobile", "ZebraRing"
  ],
  "asset_paths": [
    "RTV",
    "Returns (Liq)",
    "Returns (Decom)",
    "RMA-PTS"
  ]
}
```

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
5. Confirm/adjust default schedule (start time, end time, break/lunch durations)
6. Done — full config saved, redirects to `/today`

On subsequent launches, if `config.json` is complete, the app skips setup and goes straight to the day view.

---

## Database Schema (unchanged from legacy)

```sql
CREATE TABLE TimeLogTable (
    uid TEXT PRIMARY KEY,       -- "{user_id}_{seq}_{unix_timestamp}"
    date DATE,                  -- "MM/DD/YYYY"
    job TEXT,                   -- task category
    time TIME,                  -- timestamp "HH:MM:SS AM/PM"
    e_time TIME,               -- elapsed time "H:MM:SS"
    memo TEXT,                  -- free text
    device TEXT,               -- device type (nullable)
    qty INT                    -- quantity (nullable)
);
```

This is the existing schema from `timelog.db`. We keep it exactly as-is so historical data works without migration.

### New: Day State (in-memory + autosave)

The "day canvas" is stored as a JSON array of blocks in a new table (or a separate local file) that represents the *working draft* before it's committed to TimeLogTable:

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

When you **post**, the blocks are flattened into TimeLogTable rows (for historical compatibility) AND written to the target workbook.

---

## Target Workbook Post Format

Must exactly replicate what `datatransfer.bas` does today:

| Data | Source | Destination (by day column B-F) |
|------|--------|-------------------------------|
| 13 productivity values | Aggregated from blocks by device type | Rows 7–19 |
| Working hours | Clock in to clock out minus breaks | Row 22 |
| Non-working hours | Breaks + lunch | Row 23 |
| Comment | Concatenated memos or user summary | Day-specific cell (B26/B28/B30/B32/B34) |

**Day-to-column mapping:**
- Monday → Column B
- Tuesday → Column C
- Wednesday → Column D
- Thursday → Column E
- Friday → Column F

**Safety:** Before writing, the app:
1. Copies the target workbook to `backup/` with timestamp
2. Opens with openpyxl
3. Writes ONLY the relevant day column + comment cell
4. Saves and closes
5. Reports success/failure to user

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
- Show last 20 unique entries (sorted by frequency)
- [ + New ] at bottom
- One tap to select, then time + memo

**Any task can optionally attach device + qty** (not just asset processing).

---

## Editing

- **Click a block** → inline edit popover (change any field)
- **Drag top/bottom edge** → resize (change start/end time)
- **Drag the block body** → reorder (times auto-adjust)
- **Right-click / long-press** → Delete, Split, Duplicate
- **Undo/Redo** → standard Ctrl+Z/Y, unlimited within session

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

❌ = blocks POST button
⚠️ = shows warning but allows override

---

## "Open Target" Button

Opens the manager's shared workbook directly in Excel via `os.startfile()`. This lets the user:
- Review what's been posted
- Use the manager's "Clear" button
- Verify data

---

## Report View

A secondary view (tab or modal) that shows the day in the "brief" format:
- Productivity table (device × qty × time)
- Time breakdown (production, admin, breaks)
- Schedule compliance (in/out vs expected)
- Full comment/narrative

Exportable as PDF or clipboard copy.

---

## Historical Data

- The app reads from the local `timelog.db` for any past date
- Date picker lets you view/edit any previous day
- If a day has been posted, it shows as "Posted ✓" but remains editable (re-post overwrites)
- Future: pull from shared drive DB for cross-user reporting (nice-to-have)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
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

## Build Phases

### Phase 1: Foundation
- [ ] Project structure on local + share
- [ ] `bootstrap.py` — launches Flask, opens browser
- [ ] `config.json` schema + first-run wizard (web-based)
- [ ] Flask API: CRUD for day blocks
- [ ] SQLite layer: read/write TimeLogTable + DayDraft
- [ ] Basic HTML shell with dark mode styling

### Phase 2: Timeline UI
- [ ] Render blocks as a vertical timeline
- [ ] Click to edit (popover)
- [ ] Drag to resize (pointer events)
- [ ] Drag to reorder
- [ ] Add/delete blocks
- [ ] Undo/redo

### Phase 3: Guided Entry
- [ ] "Add Activity" modal flow
- [ ] Asset Processing path (path → device → qty → time → memo)
- [ ] Project/Admin/Meeting with recent-items list
- [ ] Break/Lunch/5S quick-add
- [ ] Optional device+qty attachment on any task

### Phase 4: Post & Report
- [ ] Pre-post validation UI
- [ ] openpyxl write to target workbook (with backup)
- [ ] "Open Target" button
- [ ] Report view (brief-style summary)
- [ ] Flatten blocks → TimeLogTable rows on post

### Phase 5: Polish & Deploy
- [ ] First-run setup wizard
- [ ] Historical day navigation
- [ ] PDF/clipboard export
- [ ] PyInstaller build for bootstrap.exe
- [ ] Deploy web files to share
- [ ] Test with second user (different target workbook)

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

**First-run setup** asks for this path alongside `web_root` and `target_workbook`. Default suggestion: the directory where the shared web files live (likely a sibling folder).

---

## Open Questions

1. **Device list** — hardcoded in config or pulled from a shared source? (Currently config.json per user, but could be a shared `devices.json` on the share drive)
2. **Asset path list** — same question. Likely shared so when paths change, everyone gets it.
3. **Multi-device per block** — can one activity block have multiple device types? (e.g., "RTV: 3× ZebraTC + 2× ZebraMC in one session") Or always one device per block?
4. **Shared history DB** — is there a shared location where all users' timelogs aggregate? Or is that the manager's workbook?
5. **Offline resilience** — if the share drive is unreachable, should the app still work (serve cached web files locally)?

---

## Uninstall / Reset

The bootstrap exe supports a `--reset` flag (or a "Reset" button in Settings):

| Mode | What it does |
|------|-------------|
| **Soft reset** | Deletes `config.json` only. Next launch triggers first-run setup again. DB untouched. |
| **Hard reset** | Deletes `config.json` + `DayDraft` table (working drafts). Preserves `TimeLogTable` (historical data). |
| **Full uninstall** | Deletes the entire local folder (`config.json`, `timelog.db`, `backup/`). User is back to zero. |

**How it works:**
- From the web UI: Settings → Reset → pick level → confirm ("Are you sure? This cannot be undone.")
- From command line: `bootstrap.exe --reset soft|hard|full`
- Full uninstall also offers to export `timelog.db` to a chosen location before deletion (so data isn't lost if they want it)

**Why this matters:**
- Major revisions (schema changes, new web version) may need a clean slate
- Users who leave the team can wipe their local data
- Troubleshooting: "just reset it" is a valid support answer

---

## Migration Path

1. Deploy DayBuilder alongside existing Tardis/BridgeReporter (no disruption)
2. Users opt-in by running bootstrap.exe
3. Historical data in `timelog.db` is immediately visible
4. Old tools remain functional until team is comfortable
5. Eventually retire Tardis + BridgeReporter

---

*Last updated: 2025-01-14*
*Author: chrlsim + Claude*
