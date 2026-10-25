# ASK Crew Upgrade Report

> Superseded wiring note: the historical `/api/v1/matches/{match_id}/ask` endpoint described below has been removed. Current Ask-the-Agent/Analyst chat uses the Azure Function `/api/orchestrate` through `orchestratorClient`; this report's proposed endpoint is not an active integration.

**Date:** 2026-10-24  
**Workspace:** `/home/0xNajjar/Desktop/Rematch` (Linux checkout of Rematch-main)  
**Scope:** Match Studio ASK tab → “Ask the crew” evidence-grounded assistant UX  
**Git actions:** No commit, push, or deployment was performed.  
**Azure / Foundry:** Not modified.  
**External LLM:** Not introduced.

## Summary

ASK is upgraded into a polished **Ask the crew** panel that feels like a match-analysis assistant, while remaining honest about backend limits. Suggested questions are driven by verified capabilities only. Free-form Q&A is still rejected unless the text exactly matches a supported suggestion. No fabricated answers and no frontend-only pretend Q&A service were added.

| Area | Status |
| --- | --- |
| Editorial ASK UI (“Ask the crew”) | **Implemented** |
| Capability-driven suggested questions + filters | **Implemented** |
| Event-scoped composed narrative answers | **Implemented** (existing GET narrative) |
| Local match-event fact answers | **Implemented** (selected event + roster only) |
| WHAT IF / Decision Explorer handoff | **Implemented** |
| View this moment → shared replay seek | **Implemented** |
| Free-form / match-wide / tactical counterfactuals | **Unsupported** — marked unavailable; documented contract below |
| Backend ask API | **Not implemented** — proposed only |

---

## 1. Verified current ASK contract

### Endpoint used today

| Item | Value |
| --- | --- |
| Method / path | `GET /api/v1/matches/{matchId}/events/{eventId}/decision-analysis/narrative` |
| Frontend | `MatchService.getDecisionNarrative` → `useDecisionNarrative` |
| Request body / query / question text | **None** |
| Locale param | **None** — response always includes `narrative.english` and `narrative.arabic` |
| Response | `DecisionNarrativeResponse`: `matchId`, `eventId`, `provenance`, `analysis`, `verificationResults`, `narrative` |
| Errors | `404` / `422` → unavailable; other failures → error + retry |
| Mock mode | Always unavailable (`DecisionNarrativeUnavailableError`) — never fabricates narrative |

### Capability matrix (verified)

| Capability | Supported by current contract? |
| --- | --- |
| Selected-event explanations (pass / shot / carry) | **Yes** |
| Evidence / fact-check rows (`verificationResults`) | **Yes** (reference/calculation validation only; `claimSupportStatus` remains `not_assessed`) |
| Arabic and English narratives | **Yes** (both returned; UI picks by locale) |
| Arbitrary free-form user questions | **No** |
| Match-wide summaries and comparisons | **No** |
| Follow-up chat / conversation memory | **No** |

The event-scoped narrative endpoint is **not** a generic question-answering API. ASK continues to treat it as a composed decision narrative for one decision-candidate event.

---

## 2. UI and interaction changes

### Files

| Path | Change |
| --- | --- |
| `rematch-frontend/src/components/match/MatchStudioPanel.tsx` | Ask-the-crew layout, suggestions, composer, answer states |
| `rematch-frontend/src/components/match/MatchStudioPanel.module.css` | Editorial ASK styles, sticky composer, filters |
| `rematch-frontend/src/lib/askCrew.ts` | Suggestion builder, filters, local facts, title matching |
| `rematch-frontend/src/lib/askCrew.test.ts` | Unit tests for suggestion honesty |
| `rematch-frontend/src/components/match/MatchStudioPanel.test.tsx` | Expanded ASK state / suggestion / RTL tests |
| `rematch-frontend/src/pages/MatchAnalysisPage.tsx` | `onClearAsk` clears page-owned narrative enablement |
| `rematch-frontend/src/i18n/strings.ts` | EN/AR Ask-the-crew copy |
| `ASK_CREW_UPGRADE_REPORT.md` | This report |

### Preserved navigation and replay

- Studio actions remain **LIVE · ASK · WHAT IF · REPORT**.
- Shared page-owned selection + `useMatchPlaybackClock` unchanged (no second player).
- LIVE feed, Match Replay Timeline, momentum chart, Insights, continuous 2D animation preserved.
- Narrative enablement still requires explicit ask (`askedDecisionKey`).

### ASK UX highlights

- Editorial heading **Ask the crew** with subtitle and capability explanation.
- Contextual suggested-question rows with capability labels and **Unavailable** badges.
- Filters: All / Goals / Decisions / Passing / Tactics.
- Sticky bottom composer with Ask submit, “Ask about this event”, Clear; Enter submits; keyboard-accessible tabs retained.
- Compact answer region with evidence tags (facts / calculated / alternatives / unknown).
- Empty, loading, partial, unavailable, error+retry, and unsupported states.
- Answer actions: **View this moment** (shared seek), **Compare in WHAT IF** (Decision Explorer), **Clear**.
- Answer state persists across LIVE ↔ ASK tab switches via page-owned `narrativeState` / `narrativeByEventId`.
- Copy-to-clipboard was **not** added (no existing UI pattern for it).

---

## 3. Which suggested questions genuinely work

| Suggestion | How it works | Status |
| --- | --- | --- |
| Why did this decision unfold this way? | Calls existing narrative GET for selected pass/shot/carry | **Works** when decision candidate selected |
| What evidence supports this analysis? | Same narrative GET; renders `verificationResults` | **Works** when decision candidate selected |
| Which player was involved in this moment? | Local facts from selected event + roster (no API) | **Works** when any event selected |
| Why did this goal happen? | Narrative GET when selected shot `outcome === 'goal'` | **Works** for goal shots |
| What alternative pass was available? | Opens Decision Explorer / WHAT IF for selected pass | **Works** for pass decisions |
| Compare the observed action with an available alternative. | Opens Decision Explorer / WHAT IF | **Works** for decision candidates |
| What changed before the goal? | Marked unavailable | **Unavailable** — needs ask API / multi-event retrieval |
| What would change if the team pressed higher? | Marked unavailable | **Unavailable** — tactical counterfactual not supported |
| Summarize this match's key decision moments. | Marked unavailable | **Unavailable** — match-wide summary not supported |

Composer behavior:

1. Exact match to a suggestion title → runs that suggestion’s action.
2. Empty submit with a decision candidate selected → narrative ask.
3. Any other free-form text → honest unsupported message; **no** narrative/LLM call.

---

## 4. Backend capabilities added

**None.** No backend routes, schemas, or services were changed for this upgrade.

Frontend continues to use only the existing narrative composition endpoint for agent answers.

---

## 5. Proposed smallest safe ask contract (not implemented)

Documented for a future backend phase. Do not implement a pretend frontend client for this until the server exists and can be validated.

### Proposed route

`POST /api/v1/matches/{match_id}/ask`

### Request (draft)

```json
{
  "question": "string (1–500 chars)",
  "eventId": "string | null",
  "language": "en | ar",
  "clientRequestId": "string | null"
}
```

### Response (draft)

```json
{
  "matchId": "string",
  "eventId": "string | null",
  "status": "answered | partial | unsupported | unavailable",
  "provenance": "synthetic | api",
  "answer": {
    "english": { "headline": "…", "body": ["…"], "limitations": ["…"] },
    "arabic": { "headline": "…", "body": ["…"], "limitations": ["…"] }
  },
  "evidence": [{ "kind": "event|frame|calculation|player_position", "id": "…", "matchId": "…", "detail": null }],
  "relatedEventIds": ["…"],
  "factClasses": ["match_data", "calculated", "alternative_estimate", "unknown"],
  "reason": "string | null"
}
```

### Required server rules

- Ground answers only in approved match/event/analysis evidence catalogs.
- Explicit `unsupported` / `partial` / `unavailable` outcomes — never invent players, distances, speed, possession, or tactics.
- Input validation, per-IP/user rate limits, timeouts, and safe 4xx/5xx handling.
- Privileged credentials stay server-side; browser never receives Foundry/bearer secrets.
- No requirement for an external LLM on day one; deterministic template grounding is preferred until approved.

Until this exists, ASK must not claim free-form Q&A.

---

## 6. Evidence and security guarantees

- Narrative answers show provenance (`synthetic` vs `api`), observations, limitations, and verification rows with truth-scope disclaimer.
- Evidence tags distinguish match-data facts, calculated/model estimates, alternatives, and unknown/insufficient evidence.
- Local-fact answers expose only selected event fields (minute, type, team, player, receiver/outcome when present) and list missing fields.
- Mock narrative path remains non-fabricating.
- No bearer tokens, Foundry keys, or other secrets added to frontend code.
- No second playback clock; seek uses existing `onSelectEvent` → `seekGeneration`.

---

## 7. Tests and results

### Frontend

```text
npm run typecheck  → pass
npm run lint       → pass
npm run test       → 24 files / 146 tests pass
npm run build      → pass
```

Coverage added/extended for:

- ASK crew heading and tab switching
- Suggested-question actions (narrative / what-if / local facts / unavailable)
- Free-form unsupported vs title-matched supported submit
- Loading / success / partial tags / unavailable / error+retry / clear
- Evidence rows and View moment / Compare WHAT IF actions
- Filters (Goals / Decisions / Passing / Tactics)
- English / Arabic + RTL labels
- Sticky composer presence
- `askCrew` unit honesty (no invented metrics)

### Backend

No backend code changed; backend tests were not re-run.

---

## 8. Remaining unsupported capabilities

- Arbitrary natural-language match Q&A
- Match-wide decision summaries and multi-event “what changed before…”
- Tactical counterfactuals (“press higher”, formation changes)
- Semantic claim truth assessment (`claimSupportStatus` stays `not_assessed`)
- Chat history / follow-up threads
- Streaming answers
- External LLM / Microsoft Foundry dependency
- Deployment, commit, push, Azure resource changes

---

## Implemented vs still needing backend work

### Implemented now

- Ask-the-crew visual redesign with Rematch typography/colors and EN/AR
- Contextual suggestions with honest unavailable marking
- Event narrative answers via existing GET narrative contract
- Local event-fact answers
- Replay seek and WHAT IF navigation from answers
- Filters, clear/retry, sticky composer, accessibility basics
- Focused tests + production build validation

### Supported questions (honest)

- Decision-candidate explanations and evidence checks (narrative endpoint)
- Who was involved (local event facts)
- Why this goal (goal-shot narrative)
- Alternative pass / compare alternatives (WHAT IF / Decision Explorer)

### Still requiring backend work

- Free-form grounded ask API (`POST …/ask` or equivalent)
- Match-wide summaries, pre-goal context, tactical what-ifs
- Optional follow-up context and richer evidence retrieval across events

**Not claimed:** deployment, commit, push, or Azure/Foundry changes.
