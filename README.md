# DayBuilder

A guided daily activity logger for warehouse IT technicians. Replaces both **Tardis** (PySide6 time tracker) and **BridgeReporter** (Excel report generator) with a single, modern, editable day-builder UI that posts directly to the manager's shared weekly spreadsheet.

## Architecture

Hybrid: Bootstrap exe + Shared Web UI + Local SQLite DB

- **Flask** localhost server serves a vanilla HTML/CSS/JS frontend
- **SQLite** stores time logs and day drafts locally
- **openpyxl** writes productivity data to the target Excel workbook
- **Network share** hosts the web UI files (updates propagate to all users on next launch)

## Quick Start

```bash
pip install flask openpyxl
python bootstrap.py
```

On first run, select the RMAJobLogger folder on the shared drive when prompted. The app opens in your browser at `http://localhost:5150`.

## Tech Stack

| Layer | Tech |
|-------|------|
| Bootstrap | Python 3.x, PyInstaller |
| Server | Flask |
| Database | SQLite3 |
| Excel | openpyxl |
| Frontend | Vanilla HTML/CSS/JS |
| Palette | RADscout dark mode |

## Project Status

- [x] Phase 1: Foundation
- [x] Phase 2: Timeline UI
- [x] Phase 3: Guided Entry
- [x] Phase 4: Post & Report
- [x] Phase 5: Polish & Deploy
- [x] Revision 1: UX & Setup Overhaul (v2.6.0)

## Revision 1 Changes (v2.6.0)

- Title bar with app name and username display
- Clock in/out rendered as point-in-time markers
- Auto-populated day template (clock in, breaks, lunch, clock out)
- Improved resize handles with 15-min snap and drag tooltip
- Device/qty accordion on non-asset blocks
- Calendar mini-map with color-coded day states
- Historical data loading with legacy reconstruction indicator
- Setup flow rework (RMAJobLogger directory discovery, Tech Reports file picker)
- Open-slot click-to-add (double-click/right-click gaps)
- Fixed shutdown/exit functionality
- Fixed PyInstaller BASE_DIR for frozen exe
