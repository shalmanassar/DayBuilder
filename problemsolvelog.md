# Problem Solve Log — Bootstrap Launch Flow (v2.6.1)

**Date:** 2026-05-15  
**Status:** UNRESOLVED — carry forward to Monday  
**Reporter:** chrlsim  

---

## The Problem

The exe (`RMA Job Tracking Launcher.exe`) has three failures in its first-run launch sequence:

### 1. Splash screen launches before finding the share drive

The splash window ("☀ RMA Job Tracking / Starting server...") appears immediately — BEFORE the app knows where the share drive is. This is misleading because:

- If the share isn't found, the app can't actually start (no web UI files to serve)
- The splash implies the app is working when it may be about to fail
- The splash should either appear AFTER the share is confirmed, or should update its message to reflect what's happening ("Looking for shared drive..." → "Starting server...")

### 2. Username not pulled from Windows profile

`os.getlogin()` is called in `tier1_setup()` and the result is saved to `config.json`. However, when the browser opens to the setup wizard (`/setup`), the username field is EMPTY.

**Root cause hypothesis:** The setup.html fetches `/api/config` to pre-fill the username field. But the config may not have `user_id` saved yet at the point the browser loads — there's a race condition or the save isn't happening before Flask starts serving. Need to verify:
- Is `save_config(cfg)` called with `user_id` before Flask starts?
- Is the `/api/config` endpoint returning the `user_id` that was set?
- The code path: `tier1_setup()` returns `user_id` → `cfg.setdefault("user_id", user_id)` → `save_config(cfg)` — but `save_config` may only be called in the `if result.get("web_root")` branch or the `if not web_root` fallback branch. Check ALL code paths.

### 3. Folder picker uses wrong/old verbiage

When the app can't auto-find the share (known paths don't exist), it falls back to a tkinter `filedialog.askdirectory()` with:

```
title="Select the RMAJobLogger folder on the shared drive"
```

But per revisionpath01.md, the dialog should:
- Be labeled clearly: "Select the RMAJobLogger folder on the shared drive"  
- Start browsing at `W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering`
- If that path is unreachable, fall back to user's home or C:\

**What the user actually saw:** The old pre-revision verbiage (possibly "Select the DayBuilder shared web folder" or similar). This suggests the exe that was running may have been an older build, OR the `tier1_setup()` code path that was hit didn't have the updated text.

---

## Current Architecture (for Monday's agent)

```
EXE launches from anywhere (desktop, downloads, etc.)
  ↓
BASE_DIR = folder where exe lives (config.json, timelog.db, logs go here)
  ↓
tier1_setup() tries to FIND the share drive:
  1. Check hardcoded known_paths[] for RMAJobLogger/DayBuilder/web/
  2. If not found → tkinter folder picker
  3. Returns {web_root, sync_target, user_id}
  ↓
resolve_web_root(cfg) checks cfg["web_root"] or falls back to BASE_DIR/web/
  ↓
Flask starts, serves from web_root (or cache/ if offline)
  ↓
Browser opens → /setup (if config incomplete) or / (if config complete)
```

## What Needs to Happen

The correct flow should be:

1. **Splash appears** — "Looking for shared resources..."
2. **Auto-scan known paths** — silently check if RMAJobLogger exists at known locations
3. **If found:** update splash → "Starting server...", save web_root + user_id to config, start Flask, open browser
4. **If NOT found:** update splash → "Shared drive not found", then show folder picker with CLEAR label: "Select the RMAJobLogger folder on the shared drive" starting at `W:\Team Spaces\...`
5. **Username** (`os.getlogin()`) must be saved to config.json BEFORE Flask starts, so `/api/config` returns it when setup.html loads
6. **Browser opens** with username pre-filled in the setup wizard

## Key Files

- `bootstrap.py` — `tier1_setup()`, `show_splash()`, `main()`
- `web/setup.html` — fetches `/api/config` on load to pre-fill username
- `app.py` — `/api/config` GET endpoint returns `cfg` dict

## Known Hardcoded Paths (in tier1_setup)

```python
known_paths = [
    r"W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering\RAD1\RMAJobLogger",
    r"W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering\RMAJobLogger",
]
```

These are the auto-scan targets. If neither exists, the folder picker appears.

---

*Log created: 2026-05-15 16:42 — chrlsim + Kiro*
