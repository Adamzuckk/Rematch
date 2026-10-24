# Match Replay UI Report

**Date:** 2026-10-24  
**Workspace:** `/home/0xNajjar/Desktop/Rematch` (Linux checkout of Rematch-main)  
**Scope:** Match score-race chart + horizontal replay timeline integrated with existing match analysis replay  
**Git actions:** No commit, push, or deployment was performed.

## Summary

The match analysis page now includes:

1. **Match score race chart** (`MatchMomentumChart`) — light plate, home/away step lines from real goal events, clickable markers, HT divider, legend, score badge, playhead synced to the selected event.
2. **Match replay timeline** (`MatchReplayTimeline`) — play/pause, Full match / Highlights scope, speeds `1x–16x`, horizontal event markers, HT marker, live playhead, seek-on-click.

Both share the existing page-owned replay state (`selectedEventId`, `playing`, `speed`) with the pitch, inspector, overlay, and list timeline. No second player was introduced.

Reference screenshots were described in the request but were not present as image files in this workspace; implementation followed the written reference requirements and the existing ReMatch design system (light content plates, home/away pitch colors, Archivo typography).

## Changed files

### Added

| Path | Role |
|------|------|
| `rematch-frontend/src/lib/matchReplay.ts` | Score race, highlights filter, HT/clock helpers, step-path builder |
| `rematch-frontend/src/lib/matchReplay.test.ts` | Unit tests for race/filter/progress |
| `rematch-frontend/src/components/match/MatchMomentumChart.tsx` | Interactive score-race chart |
| `rematch-frontend/src/components/match/MatchMomentumChart.module.css` | Chart styles |
| `rematch-frontend/src/components/match/MatchMomentumChart.test.tsx` | Chart interaction tests |
| `rematch-frontend/src/components/replay/MatchReplayTimeline.tsx` | Replay bar + horizontal timeline |
| `rematch-frontend/src/components/replay/MatchReplayTimeline.module.css` | Timeline styles |
| `rematch-frontend/src/components/replay/MatchReplayTimeline.test.tsx` | Timeline / responsive smoke tests |
| `MATCH_REPLAY_UI_REPORT.md` | This report |

### Updated

| Path | Role |
|------|------|
| `rematch-frontend/src/pages/MatchAnalysisPage.tsx` | Wire chart + timeline into single replay state; decision navigation |
| `rematch-frontend/src/pages/MatchAnalysisPage.test.tsx` | Play/pause, HT, highlights, chart sync coverage |
| `rematch-frontend/src/i18n/strings.ts` | EN/AR copy for momentum + replay controls |

### Preserved (not overwritten)

- Insights page / Ask the Agents flows
- MatchCentre aggregates (including existing non-interactive shot race)
- Decision Explorer, Pick Your Pass, overlay JSON download
- Legacy `ReplayControls` component (unused by the page after this change; left in place)

## Functional controls

| Control | Behavior |
|---------|----------|
| Score-race marker click | Seeks/selects that event; updates pitch, inspector, timeline playhead |
| Score-race marker double-click | Opens Decision Explorer when the event is a decision candidate (`pass` / `shot` / `carry`) |
| Play / Pause | Advances selection through the current replay-scope event list |
| Full match | Plays all sorted events |
| Highlights | Client filter of goals, shots, and decision candidates from the seeded log — **not** a broadcast highlight package |
| Speeds `1x`, `2x`, `4x`, `8x`, `16x` | Interval = `1200ms / speed` between events |
| Timeline marker click | Seek to event index + select |
| Timeline marker double-click | Open Decision Explorer for decision candidates |
| HT markers | Drawn at conventional minute `45` (no `period` field in the contract) |
| Score badge | Prefers `match.score`; falls back to goals derived from `shot.outcome === 'goal'` |
| Sound / commentary | **Not implemented** — none existed on the match surface |

## Data honesty / API limitations

| Requested capability | Status |
|----------------------|--------|
| Momentum / xG / possession race | **Not available** in API or frontend contracts. Documented limitation; not simulated. |
| Score race step lines | **Supported** — derived only from `shot` events with `outcome: 'goal'`. |
| Event markers | **Supported** — goals, shots, and decision candidates with known minutes. |
| Final / current score | **Supported** via `MatchSummary.score` when present. |
| Halftime | **Conventional** `45'` marker only; events have no `period` field. |
| Highlights mode | **Partial** — UI mode filters real event types; there is no backend highlights feed or video package. |
| Continuous video / frame scrubbing | **Not available** — replay remains event-index based (existing architecture). |
| Audio / commentary controls | **Not available** — not present in the codebase. |

## Tests and results

### Frontend

```text
npm run typecheck  → pass
npm run lint       → pass
npm run test       → 20 files / 109 tests pass
npm run build      → pass
```

Focused coverage added for:

- Score race derivation and no invented goals
- Highlights filter membership
- Marker seek + decision double-click
- Play/pause, speed, mode, HT, playhead
- Narrow viewport smoke for the timeline
- Match analysis page sync across chart/timeline/list

### Backend

```text
uv run pytest -q  → 101 passed
```

No backend contract changes were required for this UI work.

## How to verify locally

```bash
# API (use 8001 if 8000 is occupied)
REMATCH_API_PORT=8001 ./scripts/run-local.sh --skip-setup

# Or separately:
# backend: uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
# frontend: VITE_API_BASE_URL=http://127.0.0.1:8001 npm run dev:api -- --host 127.0.0.1 --port 5173
```

Open a Phase 8 match (for frame-backed decisions), use the score race and timeline to seek, then double-click a pass/shot/carry marker or use the inspector CTA for Decision Explorer.

## Explicit non-actions

- No git commit
- No git push
- No Azure / deployment changes
