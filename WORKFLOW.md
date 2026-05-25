# HAIC Build System — Workflow Reference

## Quick Start

```bash
kiro-cli chat --agent haic
```

Then tell the HAIC: "Begin building Phase 1 of the Manager utility."

## Architecture

```
Human (you)
 └── HAIC (user-facing session, ctrl+shift+h)
      │   - Reads HAIC_STATE.md + BUILDSTATE.md
      │   - Plans Master assignments
      │   - Reviews Master reports
      │   - Manages knowledge base
      │   - Reincarnates after 5 Master cycles
      │
      └── Master (subagent, spawned by HAIC)
           │   - Reads BUILDSTATE.md for assignment
           │   - Breaks work into 1-3 Minion tasks
           │   - Reviews Minion output
           │   - Commits verified code to git
           │   - Indexes code structure
           │
           └── Minion (subagent, spawned by Master)
                   - Implements ONE small task
                   - Runs syntax verification
                   - Indexes changes
                   - Reports back (does NOT commit)
```

## Iteration Limits

| Agent | Limit | Then What |
|-------|-------|-----------|
| Minion | 1 task | Terminates, Master reviews |
| Master | 3 Minions | Reports to HAIC, terminates |
| HAIC | 5 Masters | Reincarnates (new session) |

## Reincarnation Protocol

When HAIC hits 5 iterations:
1. Updates HAIC_STATE.md with full status
2. Updates BUILDSTATE.md with current position
3. Writes HAIC_HANDOFF.md (teaching doc for successor)
4. Commits everything to git
5. **Spawns new HAIC as a persistent session** (stays alive itself)
6. Monitors new HAIC's first 2 Master cycles
7. Can inject corrections or interrupt if new HAIC drifts
8. After 2 successful cycles, sends "supervision complete" message
9. Tells you the handoff is done — you can close the old session

The old HAIC remains awake during the teaching period. It reviews:
- The new HAIC's Master assignment plans (new HAIC reports before spawning)
- Git commits made during supervised cycles
- BUILDSTATE.md updates for accuracy
- Can update HAIC_HANDOFF.md with corrections in real-time

## File Roles

| File | Owner | Purpose |
|------|-------|---------|
| `BUILDSTATE.md` | All agents read; HAIC + Master write | Task coordination |
| `HAIC_STATE.md` | HAIC only | Iteration tracking, lessons, meta-state |
| `HAIC_HANDOFF.md` | Written by outgoing HAIC | Teaching doc for successor |
| `.kiro/agents/*.json` | Human | Agent configurations |
| `.kiro/prompts/*.md` | Human | System prompts |

## Knowledge Base

The `knowledge` tool persists across sessions. Used for:
- **Minions index:** file changes, function signatures, what they built
- **Masters index:** code structure, module relationships, verified state
- **HAIC indexes:** architecture decisions, build progress, cross-cutting concerns

Search with: `knowledge search --query "governance employee CRUD"`

## Monitoring

- Press `Ctrl+G` during a session to see the crew monitor (active subagents)
- Git log shows each Master's commits
- BUILDSTATE.md shows current position at any time

## Manual Intervention

If something goes wrong:
1. The HAIC will inform you of blockers
2. You can respond directly (HAIC is user-facing)
3. Or: exit, fix manually, then restart HAIC — it reads state files on activation

## Starting Fresh

If you need to reset:
```bash
# Keep state, new HAIC session
kiro-cli chat --agent haic

# Full reset (careful)
# Delete HAIC_STATE.md, BUILDSTATE.md, HAIC_HANDOFF.md
# Clear knowledge base
```

## Typical Session Flow

```
You: kiro-cli chat --agent haic
HAIC: "Reading state... Iteration 2/5. Last Master built governance.py.
       Next: manager_web/index.html. Spawning Master..."
       [spawns Master]
         Master: [reads BUILDSTATE, writes Minion task, spawns Minion]
           Minion: [builds index.html, verifies, indexes, reports]
         Master: [reviews, commits, spawns next Minion]
           Minion: [builds manager.css, verifies, indexes, reports]
         Master: [reviews, commits, spawns next Minion]
           Minion: [builds app.js, verifies, indexes, reports]
         Master: [reviews, commits, updates BUILDSTATE, reports to HAIC]
HAIC: "Master 3 complete. Built web UI shell (3 files). Verified.
       Progress: 5/7 Phase 1 tasks done. Continuing..."
       [spawns next Master...]
```
