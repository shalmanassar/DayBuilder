# Prompt: Update DayBuilder Build Path

You are updating an existing build plan document at `c:\localspace_laptop\DayBuilder\buildpath.md`. Read it first, then apply ALL of the following changes. Do not remove existing content unless it directly contradicts what's below — augment and clarify.

---

## 1. Add: Shared Reference Data (new section after config.json)

Device types, asset paths, and per-path quotas should NOT live in per-user config.json. They belong in a shared JSON file on the network drive so all users get updates simultaneously.

Create a section documenting `shared_config.json` (lives in the shared `web/` folder alongside the HTML):

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

Note: The `row` field is the exact row number in the target workbook where that device type's productivity count is written. This is the explicit mapping that replaces the hand-waved "rows 7-19" in the current doc.

Remove `device_types` and `asset_paths` from the per-user `config.json` example. Keep `recent_projects` and `recent_admin` there (those are per-user state).

---

## 2. Add: Explicit Workbook Row Mapping (update Target Workbook Post Format section)

Replace the vague "Rows 7-19" with the explicit mapping from `shared_config.json`. The 13 productivity values are:

| Row | Device Type | What's Written |
|-----|-------------|---------------|
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
| 17 | RTV Events | Count of RTV-path blocks (not qty, but event count) |
| 18 | Prov Events | Count of Prov-path blocks |
| 19 | (reserved) | Currently unused, write 0 |

Row 22 = total working hours (timedelta as decimal hours or HH:MM format — match existing VBA behavior)
Row 23 = total non-working hours (breaks + lunch)

Comment cells by day: B26 (Mon), B28 (Tue), B30 (Wed), B32 (Thu), B34 (Fri)

Also document: if a device type is logged that doesn't have a row mapping, it gets aggregated into the memo/comment but does NOT write to a productivity row. The app should warn but not block.

---

## 3. Add: Flask API Contract (new section)

```
GET  /api/config              → returns merged config (user + shared)
POST /api/config              → updates user config.json fields
GET  /api/day/{date}          → returns DayDraft blocks for date (YYYY-MM-DD)
POST /api/day/{date}          → saves DayDraft blocks for date
DELETE /api/day/{date}        → clears draft for date
POST /api/post/{date}         → validates, flattens to TimeLogTable, writes workbook, syncs DB
GET  /api/history?from=&to=   → returns TimeLogTable rows for date range
GET  /api/recents/{type}      → returns recent projects/admin/meetings (from DB, last 90 days)
GET  /api/workbook/sheets     → reads sheet names from target workbook (for setup)
POST /api/browse              → opens native file dialog, returns selected path
POST /api/open-target         → os.startfile() on target workbook
GET  /api/status              → health check (share reachable? DB ok? config complete?)
POST /api/reset/{level}       → soft|hard|full reset
```

All endpoints return JSON. Errors return `{"error": "message", "code": "ERROR_CODE"}`.

---

## 4. Add: Error Handling & Offline Strategy (new section)

**Network share unreachable:**
- On launch, bootstrap.exe checks if `web_root` is accessible
- If YES: serve from share (normal operation), also copy web assets to local `cache/` folder
- If NO: serve from local `cache/` folder (last-known-good). Show banner: "⚠ Offline mode — some features unavailable"
- Offline mode disables: POST to workbook, sync to shared DB, setup wizard file browsing
- Offline mode allows: viewing/editing day drafts, viewing history (local DB)

**Target workbook locked/open:**
- Before writing, attempt to open with openpyxl
- If fails (file locked): retry 2x with 2-second delay
- If still fails: show error "Target workbook is open in Excel or locked by another user. Close it and try again." with a Retry button
- NEVER silently fail or corrupt

**Post operation order (pseudo-transactional):**
1. Validate blocks (pre-post checks)
2. Flatten blocks → TimeLogTable rows (in memory)
3. Backup target workbook to `backup/`
4. Write to target workbook (openpyxl)
5. If workbook write succeeds → commit TimeLogTable rows to SQLite
6. If workbook write fails → show error, do NOT write to SQLite, do NOT mark as posted
7. If SQLite write fails after workbook success → show warning "Posted to workbook but local DB update failed — will retry on next post"
8. Sync local DB to shared drive (best-effort, non-blocking)

---

## 5. Add: Date Format Standardization (update Database Schema section)

Add a note: DayDraft uses ISO format (`YYYY-MM-DD`) internally. TimeLogTable uses legacy format (`MM/DD/YYYY`) for backward compatibility. Conversion happens at the boundary:
- When flattening DayDraft → TimeLogTable: convert `YYYY-MM-DD` to `MM/DD/YYYY`
- When reading TimeLogTable for display: convert `MM/DD/YYYY` to `YYYY-MM-DD`
- The API always speaks ISO dates. The legacy format is an internal storage detail only.

---

## 6. Add: UID Generation (update Database Schema section)

The `uid` field format: `{user_id}_{seq}_{unix_timestamp}`
- `seq` = row order within the day (0-based, assigned at flatten time based on block order)
- `unix_timestamp` = time of POST (not time of block creation)
- On re-post: DELETE all rows for that date from TimeLogTable, then INSERT fresh rows with new UIDs. This avoids deduplication complexity.

---

## 7. Add: Re-Post Behavior (new subsection under Target Workbook Post Format)

When re-posting a day that was previously posted:
- **TimeLogTable:** DELETE WHERE date = '{date}' for this user, then INSERT new rows. Clean slate.
- **Target workbook:** Overwrite the day's column in place (same cells). The backup taken before write preserves the previous state.
- **DayDraft:** Update `posted = 1`, `posted_at = now()`

---

## 8. Add: Block Time Model (new subsection under Editing)

**Source of truth:** Each block has explicit `start` and `end` times (HH:MM, 24hr format).

**During entry:** The user can specify time three ways, but all resolve to explicit start/end before the block is saved:
- "About how long" → placed after the last block's end time, end = start + duration
- "Started at / ended at" → used directly
- "Place after previous" → start = previous block's end, end = unset (user must set duration or drag to resize)

**Drag/resize rules:**
- Resizing a block changes only THAT block's start or end. Adjacent blocks do NOT auto-shift.
- This can create gaps or overlaps. Gaps show as highlighted "unaccounted time" in the timeline. Overlaps show as a red warning.
- The user resolves gaps/overlaps manually (this is the "no guardrails" philosophy).
- Pre-post validation flags gaps and overlaps as ⚠️ warnings.

---

## 9. Add: Logging & Diagnostics (new section)

- Bootstrap exe writes to `daybuilder.log` in the local folder
- Log level: INFO by default, DEBUG via `--debug` flag
- Logs: app start/stop, API calls (method + path + status), errors with tracebacks, post attempts (success/fail), sync attempts
- Log rotation: keep last 5 files, max 5MB each
- The `/api/status` endpoint returns: config completeness, share reachability, DB row count, last post date, last sync date

---

## 10. Add: Cache Busting (update Architecture section)

The shared web files include a `version.json`:
```json
{ "version": "1.0.0", "updated": "2025-01-14T12:00:00Z" }
```

On launch, bootstrap reads `version.json` from the share and compares to the cached version. If different:
- Copy fresh web assets to local `cache/`
- Clear browser cache via a version query param on the HTML (`index.html?v=1.0.0`)

---

## 11. Add: Recent Items Persistence (update config.json section)

`recent_projects` and `recent_admin` are populated by querying TimeLogTable:
- `SELECT DISTINCT memo FROM TimeLogTable WHERE job = 'Project' ORDER BY date DESC LIMIT 20`
- Same for admin, meeting

These are NOT stored in config.json — they're computed on demand from the DB via `/api/recents/{type}`. Remove them from the config.json example.

---

## 12. Add: Settings Gear (⚙) Description (update UI Structure section)

The ⚙ button opens a Settings panel where the user can:
- Change target workbook path (re-browse)
- Change target sheet name
- Adjust schedule defaults
- View/change sync target path
- View app version and share version
- Access Reset options (soft/hard/full)
- Toggle debug logging

The 📋 button copies the current day's report summary to clipboard.

---

## 13. Update: Build Phases — add acceptance criteria

Each phase should have a one-line "done when" statement:
- Phase 1: "Done when bootstrap launches Flask, serves a page from the share, and can read/write blocks to SQLite via the API"
- Phase 2: "Done when blocks render as a draggable/resizable timeline and changes persist via API"
- Phase 3: "Done when a user can add any task type through the guided flow and it appears on the timeline"
- Phase 4: "Done when POST writes correct values to the target workbook and flattens to TimeLogTable"
- Phase 5: "Done when a second user on a different machine can complete full setup and post to their own target"

---

## 14. Update: Open Questions — answer/close what we can

1. Device list → ANSWERED: shared `shared_config.json`, not per-user
2. Asset path list → ANSWERED: same, shared
3. Multi-device per block → DECISION: one device per block. If you worked on 3 TC and 2 MC in one session, that's two blocks. Simpler aggregation, simpler UI.
4. Shared history DB → ANSWERED: the POST sync target (`{user_id}_timelog.db`) serves this role
5. Offline resilience → ANSWERED: local cache of web assets, offline mode with limited functionality

---

## 15. Update: config.json — remove shared data, add sync_target

Final config.json should look like:
```json
{
  "user_id": "chrlsim",
  "user_display_name": "Charles",
  "timezone": "America/Chicago",
  "target_workbook": "W:\\...\\Tech Reports\\Charles.xlsm",
  "target_sheet": "Charles",
  "web_root": "W:\\...\\DayBuilder\\web",
  "sync_target": "W:\\...\\RMAJobLogger\\POST",
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

That's it. No device_types, no asset_paths, no recent_* lists. Those come from shared config and DB queries respectively.

---

## Final instruction

After making all changes, ensure the document reads coherently top-to-bottom. Remove or update any Open Questions that are now answered. Update the "Last updated" date at the bottom.
