# DayBuilder Archive — Index

## What's Here

Documents from the initial design conversation (2025-01-14 through 2025-04-03) that led to `buildpath.md` v2. Kept for reference — the active build plan is `../buildpath.md`.

---

## Files

### `buildpath_v1.md`
**The original build plan** — produced during buildconvo1 but never received the 15 critical updates identified in the evaluation. Superseded by `../buildpath.md` (v2).

**Useful for:** seeing what was originally written vs what was revised. If something in v2 seems wrong, check v1 for the original intent.

### `buildconvo1.md`
**Full transcript of the design conversation** — covers:
- Evaluation of BridgeReporter (VBA/Excel structure, all sheets, datatransfer.bas logic)
- Evaluation of Tardis/JobLogger (Python/PySide6, task categories, CSV/DB schema)
- Workbook inspection via openpyxl (Main, DATA, pdcount, brief sheets — cell-level dump)
- Brief sheet layout (print area, merged cells, column widths, row heights)
- Architecture decisions (hybrid exe + web, shared vs local split)
- UX philosophy (mutable canvas, guided entry, no guardrails)
- RADscout style review (palette, dark mode, .NET XAML reference)
- Task category redesign (RMA → Asset Processing, path types)
- Target workbook per-user (not hardcoded)
- Two-tier first-run setup
- Uninstall/reset options
- Shared DB sync (POST directory)
- Device quotas as updatable shared config

**Useful for:** recovering any detail that didn't make it into the build plan, understanding *why* a decision was made, exact cell references from the workbook inspection.

### `prompt_update_buildpath.md`
**The 15-item update prompt** — written by the previous agent as instructions for applying all evaluation fixes to buildpath_v1. These have now been applied in `../buildpath.md` (v2).

**Useful for:** verifying that v2 correctly implements all 15 items. Acts as a checklist.

---

## Key Reference Data (quick lookup from buildconvo1)

### Workbook Cell References
| Data | Location in BridgeReporter |
|------|---------------------------|
| Target workbook path | DATA!K3 |
| Report filename | DATA!K2 |
| User ID | DATA!K1 |
| Day-of-week flags | DATA!D31:H31 (TRUE = active day) |
| Productivity source rows | DATA!A34:A46 (device names), D34:H46 (Mon-Fri values) |
| Working hours | DATA!D49:H49 |
| Non-working hours | DATA!D50:H50 |
| Comment | DATA!D51:H51 |
| Comment cell refs | DATA!D52:H52 (B26/B28/B30/B32/B34) |

### Device Quotas (from Main sheet col I)
| Device | Quota/hr |
|--------|----------|
| ZebraMC | 10 |
| ZebraTC | 18 |
| PC | 1 |
| Avery6140 | 11 |
| ZebraZD | 8 |
| ZebraZQLn | 8 |
| ZebraZT | 1 |
| Honeywell | 10 |
| PointMobile | 1 |
| ZebraRing | 15 |
| RTV Events | 35 |
| Prov Events | 20 |

### Existing Users in POST Directory
- `chrlsim_timelog.db` (397KB)
- `baskhatt_timelog.db` (32KB)
- `Ribarrer_timelog.db` (12KB)
- `m_timelog.db` (413KB)

### RADscout Palette (from App.xaml)
- Header: `#123d52`
- Deep BG: `#02090f`
- Accents: `#b8e6ff`, `#3498db`

### Source Paths (for reference, not hardcoded)
- Tardis source: `c:\localspace_laptop\myTardis\`
- BridgeReporter source: `C:\Users\chrlsim\OneDrive - amazon.com\01liveshare-OneDrive\bridereporter4\`
- RADscout reference: `W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering\RAD1\RADscout\versions\old\RADscout-code-03052026b\`
- Shared POST dir: `W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering\RAD1\RMAJobLogger\POST`
- Target workbook: `W:\Team Spaces\RAD IT Engineering\NA RAD IT Engineering\RAD1\RAD1 RMA Reporting\Tech Reports\Charles.xlsm`

---

*Archived: 2025-04-03*
