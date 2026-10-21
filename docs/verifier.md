# Agent 3 — Verifier

## Scope

`backend/app/services/verifier.py` is a focused, local component for validating structured narrative-claim evidence against Agent 1's `EvidenceCatalog`. It delegates all checks to the existing `verify_claims` implementation in `app.services.decision.evidence`; it does not duplicate reference or calculation validation. It adds no API route and does not connect multi-agent orchestration.

The input contains a claim ID, submitted statement, evidence references, and an optional registered calculation assertion. The statement is retained only for traceability. The component does not parse natural language, infer semantic support, or establish that a statement is true. It cannot verify arbitrary rendered prose from Agent 2; a future integration must carry structured claims alongside the narrative.

## Output contract

`verify_narrative_claims(claims, catalog)` returns `NarrativeClaimVerificationResult[]` with:

- `evidenceValidationStatus`: `verified`, `partially_supported`, or `unsupported`, copied from Agent 1's reference/calculation verifier.
- `claimSupportStatus`: always `not_assessed`; valid references and calculation IDs are not proof of statement truth.
- `reason`, the submitted `evidence` references, and explicit `limitations`.
- `validationMethod` and `validationScope` identifying the existing catalog-validation method.

Results that reference a catalog calculation registered as `composite_score` carry the scoring limitation that `geometric_progression_v1` is a geometric progression/composite score, not xG or a pass-success probability. No probability, xG, outcome, or semantic status is computed.

## Tests

From `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_verifier.py tests/test_decision_evidence.py
```

The tests use only synthetic evidence catalogs and cover valid references, invalid references, mismatched calculation values, missing evidence, and the deliberately false pass-probability assertion. A verified evidence-validation result in these tests always has `claimSupportStatus: not_assessed`.

## Integration boundary

The read-only composed endpoint `GET /api/v1/matches/{match_id}/events/{event_id}/decision-analysis/narrative` passes Agent 1's structured claims and actual in-memory `EvidenceCatalog` to this component. It returns these native results alongside the bilingual narrative. A narrow adapter supplies the Narrator's existing verifier input shape while preserving `evidenceValidationStatus` and `claimSupportStatus` independently. The endpoint does not expose the catalog for reconstruction, accept caller-invented evidence, or connect external orchestration. Do not translate `evidenceValidationStatus: verified` into semantic support.
