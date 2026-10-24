# Match Centre Redesign Report

**Date:** 2026-10-24  
**Workspace:** `/home/0xNajjar/Desktop/Rematch` (Linux checkout aligned with Rematch-main)  
**Git actions:** No commit, push, or deployment was performed.

## Summary

Match Centre (`/matches/:matchId`) now provides two genuine experiences driven by the existing TopBar Fan / Analyst persona control:

1. **Fan View** — pitch-first, compact score header, highlights strip, collapsible Match Studio, and tabbed secondary content (Overview / Match Events / Team Stats / Players).
2. **Analysis View** — denser analysis workspace with the same shared match + playback state, plus analytical regions (Decisions / Match flow / Team analytics / Player analytics / Evidence & AI).

Switching views only changes presentation. Match ID, selected event, playback clock, language, and narrative cache stay on the page.

## Before / after information architecture

### Before

- Single long page for both personas.
- Fan vs Analyst changed overlay headline copy and a mode chip only.
- Pitch + studio + score race + full Match Centre (comparison, shot race, players, pass networks, squads) stacked vertically.
- `MatchHighlightsStrip` existed but was not mounted.

### After — Fan View (default)

1. Compact score header (teams + score dominant; synthetic disclosure kept unobtrusive).
2. Highlights strip (real seeded events only).
3. Dominant 2D pitch + continuous simulation + replay timeline.
4. Collapsible Match Studio (LIVE / ASK / What If / Report).
5. Secondary tabs:
   - **Overview** — key metric cards + score-race chart
   - **Match Events** — score-race chart synced to the shared clock
   - **Team Stats** — team comparison only
   - **Players** — involvement table; pass networks / squads behind expandable details

### After — Analysis View

1. Compact header with Analysis workspace badge.
2. Pitch + replay (slightly tighter than Fan) + sticky studio aside on desktop.
3. Analysis workspace tabs:
   - **Decisions** — selected decision candidate + Decision Explorer CTA
   - **Match flow** — score race + shot race
   - **Team analytics** — comparison + pass networks
   - **Player analytics** — involvement + squad
   - **Evidence & AI** — provenance labels; studio remains the LIVE/ASK/Report surface

## Fan View and Analysis View behavior

| Concern | Behavior |
|--------|----------|
| Control | TopBar Fan / Analyst buttons (`aria-pressed`, shared `PersonaContext`) |
| Transport | `localStorage` `rematch.persona.v1` (unchanged; no new query param) |
| Playback | Single `useMatchPlaybackClock` + `selectedEventId` / `playing` / `speed` / `replayMode` |
| Highlights | `buildMatchHighlights` → seek via `selectEvent` |
| Studio | Same `MatchStudioPanel`; compact chrome in Fan |
| Language / RTL | Existing locale provider; AR strings added for new chrome |

**Analysis View is a genuine separate advanced experience**, not a color/label change.

## Components and files changed

### Added

| Path | Role |
|------|------|
| `rematch-frontend/src/components/match/KeyMetricsStrip.tsx` | Compact goals/shots/passes/tackles cards from event counts |
| `rematch-frontend/src/components/match/KeyMetricsStrip.module.css` | Metrics strip styles |
| `MATCH_CENTRE_REDESIGN_REPORT.md` | This report |

### Updated

| Path | Role |
|------|------|
| `rematch-frontend/src/pages/MatchAnalysisPage.tsx` | Fan / Analysis layout branching; shared playback |
| `rematch-frontend/src/pages/MatchAnalysisPage.module.css` | View layouts, tabs, reduced-motion |
| `rematch-frontend/src/pages/MatchAnalysisPage.test.tsx` | View switch, highlights, a11y, AR/RTL |
| `rematch-frontend/src/components/match/MatchHeader.tsx` (+ CSS) | Compact score-first variant + view badge |
| `rematch-frontend/src/components/match/MatchCentre.tsx` (+ CSS) | Sectioned rendering, dense mode, expandable advanced blocks |
| `rematch-frontend/src/components/match/MatchStudioPanel.tsx` (+ CSS) | `compact` / `defaultTab` props |
| `rematch-frontend/src/components/match/MatchHighlightsStrip.tsx` | Wired into Fan View (pre-existing component) |
| `rematch-frontend/src/app/layout/TopBar.tsx` | Accessible mode switch (`aria-pressed`, i18n label, test ids) |
| `rematch-frontend/src/i18n/strings.ts` | EN/AR keys for highlights, tabs, regions, metrics |

### Reused without duplication

- `FootballPitch` continuous simulation
- `MatchReplayTimeline` / `MatchMomentumChart`
- `MatchStudioPanel` (single instance per view tree)
- `useMatchPlaybackClock` / `matchSimulation` / `matchReplay` / `matchCentre` / `matchHighlights` helpers
- Decision Explorer route navigation
- Overlay JSON report export

## Existing functionality preserved

- Match load / not-found / error + retry
- Continuous 2D pitch animation and player labels
- Replay play/pause, speeds, full/highlights scope
- Score-race chart synced to selection
- Match Studio LIVE / ASK / What If / Report
- Decision narrative ASK flow and unavailable states
- Team comparison, shot race, player involvement, pass networks, squads
- Synthetic-data labeling and simulation disclaimer
- English / Arabic strings and RTL `dir`

## Data / API limitations

| Requested item | Status |
|----------------|--------|
| Goals / shots / passes / tackles snapshot | Supported from seeded event counts |
| Highlights | Derived from real events only (goals, shots, decision candidates, tackles/pressures) |
| Score race | Supported from goal outcomes |
| Shot race | Cumulative shots — **not** xG |
| Pass networks | Completed passes + frame averages when present |
| Distance / speed / possession % | **Not available** — omitted |
| Fabricated AI answers | **Not added** — ASK unavailable states preserved |
| Mock fallback in API mode | **Not introduced** |

## Tests and results

### Frontend

```text
npm test        → 24 files, 151 tests passed
npm run lint    → passed
npm run typecheck → passed
npm run build   → passed
```

New / extended coverage on `MatchAnalysisPage.test.tsx`:

- Fan View default composition (highlights + section tabs; networks not dumped)
- Analysis View switch preserving selected event + pitch/studio
- Highlight chip seeks shared selection
- Keyboard-operable Fan section tabs and Analysis region tabs
- Arabic Fan View copy + `dir="rtl"`
- Existing studio ASK / replay / empty / error paths retained

### Backend

No backend code changes. Backend tests were not run.

## Visual verification

Browser visual review at desktop/mobile sizes was **not** performed in this session (no interactive browser pass against a running UI). Layout rules include responsive breakpoints (stack ≤1023px), sticky analysis studio on desktop, and `prefers-reduced-motion` handling for view transitions.
