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

On first run, select the shared `web/` folder when prompted. The app opens in your browser at `http://localhost:5150`.

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
- [ ] Phase 2: Timeline UI
- [ ] Phase 3: Guided Entry
- [ ] Phase 4: Post & Report
- [ ] Phase 5: Polish & Deploy
