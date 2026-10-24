# LIVE / ASK Tabs Report

**Date:** 2026-10-24  
**Workspace:** `/home/0xNajjar/Desktop/Rematch` (Linux checkout of Rematch-main)  
**Scope:** Match Studio LIVE + ASK tabs on the match analysis page  
**Git actions:** No commit, push, or deployment was performed.  
**Azure / Foundry:** Not modified.

## Summary

The match analysis inspector column is now a **Match Studio** panel with compact **LIVE** and **ASK** tabs. Both reuse the existing page-owned replay selection state and the existing composed narrative service. Free-form match Q&A is **not** faked.

| Capability | Status |
| --- | --- |
| LIVE chronological event feed | **Implemented** — seeded events only |
| LIVE → shared replay seek | **Implemented** |
| LIVE narrative headlines | **Implemented only when** a prior ASK narrative exists for that event |
| ASK event-scoped narrative | **Implemented** via existing `getDecisionNarrative` |
| ASK free-form match questions | **Unsupported** — honest UI message; no fabricated answers |
| What If / Report actions | **Preserved** — Decision Explorer navigation + overlay JSON download |
| Insights / Ask the Agents (Decision Explorer) | **Unchanged** |
| Match Replay chart / timeline | **Unchanged** |

## Files changed

### Added

| Path | Role |
| --- | --- |
| `rematch-frontend/src/components/match/MatchStudioPanel.tsx` | LIVE / ASK studio panel |
| `rematch-frontend/src/components/match/MatchStudioPanel.module.css` | Studio styles |
| `rematch-frontend/src/components/match/MatchStudioPanel.test.tsx` | Tab, feed, ASK, RTL tests |
| `LIVE_ASK_TABS_REPORT.md` | This report |

### Updated

| Path | Role |
| --- | --- |
| `rematch-frontend/src/pages/MatchAnalysisPage.tsx` | Wire studio panel + narrative enablement |
| `rematch-frontend/src/pages/MatchAnalysisPage.test.tsx` | LIVE/ASK sync + page coverage updates |
| `rematch-frontend/src/i18n/strings.ts` | EN/AR studio copy |

### Preserved (not overwritten)

- Decision Explorer “Ask the agents” flow
- Insights page
- MatchMomentumChart / MatchReplayTimeline
- EventInspector / EventTimeline components (still in repo; studio replaces their placement on this page)

## Actual endpoints and contracts used

### LIVE

No new endpoint. LIVE reads the same match events already loaded by `useMatchAnalysis` → `MatchService.getMatchEvents` (mock catalogue or `GET /api/v1/matches/{matchId}/events`).

Displayed fields come only from event / team / player records: minute, type, team, player. Cached narrative headlines appear only after a successful ASK for that event.

### ASK — supported path (event-scoped)

| Item | Contract |
| --- | --- |
| Method / path | `GET /api/v1/matches/{matchId}/events/{eventId}/decision-analysis/narrative` |
| Frontend | `MatchService.getDecisionNarrative(matchId, eventId)` via `useDecisionNarrative` |
| Request body / question text | **None** — path IDs only |
| Response | `DecisionNarrativeResponse`: nested `analysis`, `verificationResults`, bilingual `narrative` |
| Errors | `404` / `422` → unavailable; other failures → error + retry |
| Mock mode | Always unavailable (`DecisionNarrativeUnavailableError`) — no fabricated narrative |

Eligibility: selected event must be a decision candidate (`pass` / `shot` / `carry`), matching Decision Explorer.

### ASK — unsupported path (free-form)

There is **no** generic match question endpoint (`/ask`, chat, or question body). Submitting free-form text shows an explicit unsupported message and does **not** call any narrative or LLM API.

## Which ASK behaviors are genuinely supported

| Behavior | Supported? |
| --- | --- |
| Ask about the **selected decision-candidate event** | Yes — composed narrative GET |
| Show backend EN/AR headline, observations, limitations | Yes — when response is ready |
| Show returned evidence-validation statuses + source refs | Yes — with truth-scope disclaimer |
| Partial / unavailable / error / retry | Yes |
| Arbitrary natural-language match questions | **No** |
| Invented stats, players, or commentary | **No** |
| Microsoft Foundry / external LLM in this task | **No** |

## UI notes

- Tabs: keyboard-focusable `role="tablist"` with arrow-key switching (RTL-aware).
- LIVE: scrollable feed, previous/next, selection syncs pitch + Match Replay Timeline playhead.
- What If: opens Decision Explorer for decision candidates.
- Report: downloads the existing timed overlay JSON.
- All new strings are EN + AR via `STRINGS`.

## Tests and results

### Frontend

```text
npm run typecheck  → pass
npm run lint       → pass
npm run test       → 21 files / 120 tests pass
npm run build      → pass
```

Coverage includes:

- LIVE ↔ ASK tab switching
- LIVE feed from real seeded events
- LIVE selection → shared replay state
- ASK free-form unsupported (no narrative call)
- ASK selected-event success path wiring + unavailable/error/retry
- Arabic narrative/tab labels
- Match analysis page LIVE/ASK integration with mocked narrative service

### Backend

No backend files were changed for this task. Backend tests were not re-run.

## Backend work still required for arbitrary match questions

To support free-form match questions honestly, the backend needs a **new** contract, for example:

1. **Path** such as `POST /api/v1/matches/{match_id}/ask` (or equivalent).
2. **Body** with constrained inputs: `question`, optional `eventId`, locale, evidence scope.
3. **Response** with grounded answer text, evidence references, completeness/partial flags, and explicit unsupported/insufficient-evidence failures.
4. **Rules** forbidding invented players/stats; grounding only in seeded/API evidence.
5. Safe browser access (session/proxy) so bearer tokens never ship to Vite/browser code.

Until that exists, ASK must remain event-scoped composed narrative only.

## Implemented vs unsupported (final distinction)

**Implemented**

- LIVE feed and replay sync from real match events
- ASK for selected decision candidates via the existing narrative endpoint
- Evidence checks / partial / unavailable / error UX for that endpoint
- What If + Report actions
- EN/AR copy and tests

**Not implemented / not claimed**

- Free-form conversational match Q&A
- Fabricated agent answers
- Deployment, commit, push, or Azure/Foundry changes
