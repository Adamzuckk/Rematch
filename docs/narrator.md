# Agent 2 — Narrator

## Scope

`backend/app/services/narrator.py` provides a small deterministic component that turns a supplied Match Intelligence truth pack into English and Arabic narratives. It does not fetch match data, call an LLM, expose an API route, or orchestrate agents. The caller must assemble the pack from Agent 1 API results and, when available, the dedicated verifier response.

The Narrator uses only fields in the supplied pack. It does not quote submitted verifier claim statements, invent player names or outcomes, calculate score differences, or infer causes. A higher `geometric_progression_v1` value is described only as a geometric progression/composite score; it is never called xG, probability, or pass-success likelihood.

## Input contract

Pass a `MatchIntelligenceTruthPack` from `app.schemas.narrator` to `narrate_truth_pack`:

| Field | Type | Meaning |
|-------|------|---------|
| `match` | `MatchSummarySchema | null` | Optional Agent 1 match summary. |
| `event` | `MatchEventSchema | null` | Optional typed event record. |
| `decisionAnalysis` | `DecisionAnalysisSchema | null` | Optional backend-computed decision analysis, including returned scores, alternatives, ranking, completeness, limitations, and provenance. |
| `verificationResults` | `ClaimVerificationResponseSchema[]` | Optional dedicated verifier results. The input validator requires legacy `status` to mirror `evidenceValidationStatus` and requires `claimSupportStatus` to be `not_assessed`. |
| `unresolvedDetails` | `string[]` | Requested details that the supplied evidence does not establish. Values are used only to trigger a generic limitation; they are not repeated as facts. |

All fields are optional so sparse packs can be narrated safely. Supplied match/event/analysis IDs must be consistent; an inconsistent pack is rejected.

## Output contract

`NarratorOutput` contains source `matchId`, `eventId`, and `provenance`, plus:

```text
english: { headline, keyObservations[], limitations[] }
arabic:  { headline, keyObservations[], limitations[] }
```

Observations use the event type/outcome, composite scores, action kinds, and ranks returned in the truth pack. Numeric values are rendered from returned values; no score or rank is recomputed. Missing analysis or unanswered details produce an explicit limitation rather than a guessed answer. Source limitations are preserved; known standard limitations have Arabic wording, while unknown source text is retained verbatim with an Arabic label.

Verifier results are narrated as evidence/reference validation only. Even when legacy `status` and `evidenceValidationStatus` are `verified`, the Narrator states that claim truth remains `not_assessed`; it never treats the legacy status alone as factual support.

## Focused tests

From `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_narrator.py
```

The tests cover English and Arabic output, source-derived observations, unsupported requested details, missing analysis, and the distinction between validated references and unassessed natural-language truth.

## Integration

`GET /api/v1/matches/{match_id}/events/{event_id}/decision-analysis/narrative` now composes Agent 1, the local Verifier, and this Narrator. The service builds the truth pack from the same analysis result and its match/event records, then returns the analysis, native verification results, and bilingual narrative. The Narrator's existing input contract and deterministic output behavior remain unchanged. No external Foundry call or multi-agent orchestration is involved.
