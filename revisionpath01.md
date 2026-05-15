# Revision Path 01 — UX & Setup Overhaul

**Date:** 2026-05-15
**Status:** Approved — ready to implement

---

## Agent Instructions

**Read `buildpath.md` first.** It contains the full architecture, database schema, API contract, file map, and design philosophy. This document describes changes to the existing codebase — not a from-scratch build.

### Key Context
- Working directory: `C:\localspace_laptop\DayBuilder\`
- The app is fully functional (Phases 1–5 complete). This is a UX revision pass.
- Web UI files live in `web/` (local dev copy) and are deployed to the network share via `python deploy.py`
- All JS is vanilla (no framework, no build tools). Modules are IIFEs exposing globals.
- The network share path `W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering` is a WorkDocs mount. It may be unreachable (VPN down, remote, etc.) — always handle gracefully.

### File → Change Map

| Change | Files to modify |
|--------|----------------|
| Title bar + validation padding + date highlight + copy icon | `web/index.html`, `web/css/app.css` |
| Clock in/out as markers + day template | `web/js/timeline.js`, `web/js/app.js`, `web/css/app.css` |
| Resize handles + 15-min snap | `web/js/timeline.js`, `web/css/app.css` |
| Device/qty accordion | `web/js/timeline.js`, `web/css/app.css` |
| Calendar mini-map + API | `web/js/app.js` (or new `web/js/calendar.js`), `web/index.html`, `web/css/app.css`, `app.py` |
| Historical data + legacy reconstruction | `app.py`, `db.py`, `web/js/app.js` |
| Setup flow rework | `bootstrap.py`, `web/setup.html`, `app.py` |
| Open-slot click-to-add | `web/js/timeline.js` |

### Implementation Order
Follow the numbered steps in the "Implementation Order" table at the bottom. Complete and verify each step before moving to the next. Run `python bootstrap.py` to test in-browser after each step.

---

## 1. First-Run Setup Flow Rework

### Current Problem
The setup asks for a "web folder" which is confusing. Users don't know what that means.

### New Flow

**Tier 1 (native dialog):**
1. Pre-fill username with `os.getlogin()` (Windows login). Let user edit if wrong.
2. Ask for the **RMAJobLogger directory** — label: "Select the RMAJobLogger folder on the shared drive"
3. Start browse at `W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering` with error handling if unreachable (fall back to user's home directory or `C:\`; show warning toast explaining the share isn't reachable)
4. App auto-discovers `POST/` and `DayBuilder/web/` under the selected directory. Validates both exist.

**Tier 2 (web-based, after Flask starts):**
1. Username shown (pre-filled from Tier 1), editable
2. "Select your Manager's Tech Reports folder" — start browse at `W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering` (same starting point)
3. Once folder is selected, show a **file list** of `.xlsm`/`.xlsx` files in that directory (like the current sheet picker UI — grid of buttons). User picks their file.
4. Sheet selection: auto-detect (first sheet, or match username). Only show sheet picker if 2+ sheets exist.
5. Schedule confirmation (same as current step 5)

### Derived Config
From the RMAJobLogger path, auto-set:
- `web_root` = `{RMAJobLogger}/DayBuilder/web`
- `sync_target` = `{RMAJobLogger}/POST`

---

## 2. UI Layout / Visual Changes

### Title Bar (new)
Add a contrasting bar **above** the current header/menu bar:
```
[ RAD RMA Productivity Tracking Utility                          USER: chrlsim ]
```
- Background: darker or lighter than header for contrast (e.g. `--bg-deep` or a slightly lighter variant)
- Left: app title text
- Right: username display

### Validation Checklist
- Add `padding-left` to the validation panel (currently flush against edge)

### Date Highlight
- When viewing today's date, visually highlight the date title (bold, accent color, or a "today" badge)

### Clipboard Button
- Replace 📋 emoji with a recognizable copy icon (SVG or Unicode `⧉` / dual-square icon)
- Ensure sufficient contrast against the header background

---

## 3. Clock In/Out as Singular Events

### Behavior
- Clock in and clock out are **point-in-time markers**, not duration blocks
- No `end` time — just a `start` (the moment)
- Auto-populated with `schedule.default_start` and `schedule.default_end` on new days
- Render as a **thin horizontal bar/marker** across the timeline, not a tall block
- No resize handles — just click to edit the time
- Visually distinct: full-width line with timestamp label, different from duration blocks

### Data Model
No schema change needed — `end` field is already nullable. Clock events just have `start` only.

---

## 4. Auto-Populated Default Day (Day Template)

### When a day is empty (no draft, no history), pre-fill:

| Block | Type | Start | End | Notes |
|-------|------|-------|-----|-------|
| Clock In | clock_in | 08:00 | — | Marker only |
| Break 1 | break | 10:30 | 10:45 | 15 min |
| Lunch | lunch | 12:00 | 12:30 | 30 min |
| Break 2 | break | 14:30 | 14:45 | 15 min |
| Clock Out | clock_out | 16:30 | — | Marker only |

### Open Slots
The gaps between these blocks render as **clickable open slots** showing the available time range:
- 08:00–10:30 (open)
- 10:45–12:00 (open)
- 12:30–14:30 (open)
- 14:45–16:30 (open)

### Interaction
- **Double-click** or **right-click** on an open slot → launches guided entry flow pre-filled with that time range
- Single click does NOT trigger entry (avoids interference with block selection/movement)

### Editability
- All template blocks are editable and deletable
- Template is generated **client-side** from the `schedule` object in `/api/config` response:
  - `schedule.default_start` → clock in time
  - `schedule.default_end` → clock out time
  - Break/lunch times are hardcoded defaults (10:30, 12:00, 14:30) but should respect `schedule.break_minutes` and `schedule.lunch_minutes` for duration
- No server call needed beyond the initial config load

---

## 5. Resize Handles — Improved Visibility

### Current Problem
Handles are invisible until hover, and hard to grab.

### New Design
- The **boundary line** between blocks (and at block edges) is **bolder** — thicker (3-4px), slightly oversized hit area
- On hover over the line area, cursor changes to `ns-resize` and line highlights with accent color
- **Snap to 15-minute increments** when dragging (nearest :00, :15, :30, :45)
- Show a small time tooltip while dragging (e.g. "09:15") so user knows where they're snapping to

---

## 6. Device/Qty — Accordion on Non-Asset Blocks

### Behavior
- **Asset processing blocks:** device & qty fields always visible (prominent)
- **All other block types:** device & qty collapsed into a small expandable section (accordion arrow/chevron)
  - Collapsed by default, shows "▸ Device/Qty" or similar
  - Click to expand and fill in if needed
  - If values are set, show them in the collapsed summary line

---

## 7. Calendar Mini-Map

### Location
Accordion dropdown **below the header/menu bar** (above the timeline). Click to expand/collapse.

### Display
- Current month as a small grid (7 columns, Sun–Sat)
- Previous/next month arrows
- Weekends dimmed

### Color Coding
| State | Color | Meaning |
|-------|-------|---------|
| No data | dark/empty (`--bg-deep`) | Nothing logged |
| Draft started | `--warning` (amber) | DayDraft exists, not clocked out |
| Clocked out | `--accent` (blue) | Day complete (has clock_out) but not posted |
| Posted | `--success` (green) | Posted to manager's workbook |

### Interaction
- Click a day → navigates to that date (loads draft or reconstructs from history)
- Before navigating away from a dirty day: prompt "Save draft before leaving?" (auto-save should handle this, but confirm if unposted changes exist)
- Before any write to shared drive / manager's workbook: always confirm "Are you sure you want to post/update the shared report?"

### Data Source
- Query DayDraft table for draft/posted status
- Query TimeLogTable for days with historical data
- New API endpoint: `GET /api/calendar/{year}/{month}` → returns day statuses for the month

### API Response Shape
```json
GET /api/calendar/2026/5
{
  "year": 2026,
  "month": 5,
  "days": {
    "2026-05-01": "posted",
    "2026-05-02": "complete",
    "2026-05-05": "draft",
    "2026-05-06": "history"
  }
}
```
Status values:
- `"posted"` — DayDraft exists with `posted = 1`
- `"complete"` — DayDraft exists, has clock_out block, not posted
- `"draft"` — DayDraft exists, no clock_out
- `"history"` — No DayDraft but TimeLogTable rows exist for that date

---

## 8. Historical Data Display

### Behavior
- Same UI for all days — current or historical
- Navigate via calendar mini-map or date picker
- Historical days load from:
  1. DayDraft (if exists) — preferred
  2. TimeLogTable reconstruction via `_rows_to_blocks()` — fallback
- Historical days are fully editable and re-postable
- The calendar mini-map shows which days have data (from either source)

### Legacy Data Compatibility
- Test `_rows_to_blocks()` against real legacy `timelog.db` data
- Handle edge cases: missing elapsed times, malformed timestamps, null fields
- If reconstruction produces incomplete blocks, show them with a "⚠ Reconstructed from legacy data" indicator

---

## Implementation Order

| Step | Area | Effort |
|------|------|--------|
| 1 | Title bar + validation padding + date highlight + copy icon | Small (CSS + HTML) |
| 2 | Clock in/out as markers + day template auto-population | Medium (JS + CSS) |
| 3 | Resize handle visibility + 15-min snap | Medium (JS + CSS) |
| 4 | Device/qty accordion | Small (JS + CSS) |
| 5 | Calendar mini-map + API endpoint | Medium (JS + Python + CSS) |
| 6 | Historical data loading + legacy reconstruction testing | Medium (Python + JS) |
| 7 | Setup flow rework (Tier 1 + Tier 2) | Medium (Python + HTML + JS) |
| 8 | Open-slot click-to-add (double-click/right-click) | Small (JS) |

---

## Out of Scope (this revision)
- Multi-user reporting / cross-team views
- PDF export
- Mobile/responsive layout
- Offline posting queue

---

*Agreed: 2026-05-15 — chrlsim + Kiro*
