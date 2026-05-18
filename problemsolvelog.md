# Problem Solve Log — Bootstrap Launch Flow (v2.6.1)

**Date:** 2026-05-15  
**Status:** RESOLVED — 2026-05-18  
**Reporter:** chrlsim  

---

## Resolution (2026-05-18)

**Approach:** Eliminated the dual-setup problem entirely. Embedded the full setup HTML inside `bootstrap.py` as a string literal. Flask serves it from memory with zero file dependencies.

**What changed:**
- `tier1_setup()` — **deleted**. No more tkinter folder picker for setup.
- `show_splash()` — kept as a **dumb launch indicator only** (no interaction, no setup logic). Shows "Opening browser..." and auto-closes when Flask is ready.
- `SETUP_HTML` — full setup wizard embedded as a raw string in `bootstrap.py`. Self-contained CSS (no external stylesheet dependency).
- `user_id` — `os.getlogin()` runs at top of `main()`, saved to config BEFORE Flask starts. `/api/config` always returns it. Setup page pre-fills from this.
- `app.py` — `_serve_embedded_setup()` returns the embedded HTML via `Response()`. All routes handle `web_root=None` gracefully. `/api/config POST` syncs cache when `web_root` is newly set.

**New flow:**
```
Double-click exe
  → Splash appears instantly ("Opening browser...")     [~100ms]
  → os.getlogin() → cfg["user_id"] saved               [instant]
  → Flask starts (serves embedded setup from memory)    [~300ms]
  → Browser opens to localhost:5150                     [~500ms]
  → Splash closes
  → Setup page renders with username pre-filled
  → User picks RMAJobLogger folder via /api/browse
  → Config saved, redirect to / (now served from share)
```

**Why this works:**
- No chicken-and-egg: Flask doesn't need web files to show the setup page
- No tkinter for setup: only the OS folder picker (triggered from browser via `/api/browse`)
- Single setup path: no more tier1 (native) vs tier2 (web) confusion
- Username guaranteed: saved before Flask starts, returned by `/api/config` on first request

**Startup time:** ~400ms from Python boot to Flask ready (confirmed in logs). Total user-perceived time: ~2-3s (PyInstaller extraction + browser open).

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

---

## What We Already Tried (DO NOT REPEAT)

### Attempt 1: Original Tier 1 — Full tkinter setup before Flask
- `tier1_setup()` showed a `simpledialog.askstring` for username, then `messagebox.showinfo`, then `filedialog.askdirectory`
- **Problem:** User hated seeing ugly native dialogs before the pretty web UI. No indication the app had launched. Felt broken.
- **Outcome:** Rejected by user.

### Attempt 2: Remove ALL tkinter — pure web setup
- Removed all native dialogs from `tier1_setup()`. Just did `user_id = os.getlogin()` and returned immediately.
- Let Flask start with local `web/` fallback, browser opens to `/setup` for everything.
- **Problem:** The exe doesn't HAVE a local `web/` folder. It lives on the user's desktop/downloads. Without finding the share drive first, there are NO web files to serve. App silently died (console=False in spec) or showed the "Cannot find web UI files" error.
- **Outcome:** Dead on arrival if exe isn't next to `web/`.

### Attempt 3: Check parent directory for web/
- Added logic: if `BASE_DIR/web` doesn't exist, check `BASE_DIR.parent/web` (handles `dist/` subfolder case).
- **Problem:** Only works during development when exe is in `dist/` inside the project. Doesn't help end users who have the exe on their desktop.
- **Outcome:** Works for dev, useless for deployment.

### Attempt 4: Hybrid — auto-scan known paths + fallback folder picker
- `tier1_setup()` checks hardcoded `known_paths[]` for the share. If found, uses it silently. If not, shows ONE folder picker dialog.
- Added `show_splash()` — a tkinter window that appears immediately saying "Starting server..."
- **Problem (current state):**
  1. Splash appears before share is found (misleading)
  2. `user_id` from `os.getlogin()` isn't making it into config before Flask serves `/api/config` — setup.html shows empty username
  3. The folder picker (when it appears) doesn't clearly tell the user what it's looking for
- **Outcome:** Partially works — app DOES launch and show the web UI. But the three issues above remain.

### Attempt 5: Saving user_id in all code paths
- Moved `cfg.setdefault("user_id", user_id)` to run immediately after `tier1_setup()` returns, before any web_root branching.
- Added `save_config(cfg)` in the fallback branch.
- **Problem:** Still didn't pre-fill. Likely because `save_config()` is called but the config dict passed to `create_app(cfg, ...)` may be a different reference, OR the save happens but the web_root fallback branch has a logic error (there was leftover duplicate code that had to be cleaned up — possible the cleanup introduced a bug).
- **Outcome:** Untested — this was the last build before end of day. The exe built successfully but the user_id issue persisted.

### Key Insight: The Chicken-and-Egg Problem
The exe needs web files to show the pretty UI. The web files are on the share drive. Finding the share drive might require user interaction. User interaction before the web UI means ugly native dialogs.

**The only clean solutions are:**
1. Auto-find the share silently (known paths) — works when VPN/WorkDocs is connected
2. If auto-find fails, show a SINGLE clear native dialog (folder picker) with good verbiage, THEN launch the web UI
3. The splash window should bridge the gap — show it immediately, update its text as things happen, close when browser opens

### Files Modified During These Attempts
- `bootstrap.py` — heavily modified `tier1_setup()`, `main()`, `BASE_DIR`, added `show_splash()`, `show_error()`
- `web/setup.html` — added RMAJobLogger folder step (step 2), renumbered all steps to 5 total
- `app.py` — added `/api/browse/files` endpoint, fixed `/api/shutdown`
- `daybuilder.spec` — changed exe name to "RMA Job Tracking Launcher"

---

*Updated: 2026-05-15 16:43 — chrlsim + Kiro*
