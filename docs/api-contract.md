# ReMatch API contract (Phases 4–9)

Base URL (local): `http://localhost:8000`  
Versioned prefix: `/api/v1`  
OpenAPI UI: `/docs` · ReDoc: `/redoc` · Schema: `/openapi.json`

By default, local development authentication is disabled. Set `REQUIRE_API_AUTH=true` and configure `API_BEARER_TOKEN` (at least 32 characters) to require `Authorization: Bearer <token>` for every `/api/v1` endpoint. When auth is required, server startup fails if no token is configured. The token is never included in OpenAPI, URLs, or application logs. See [FOUNDRY_CONNECT.md](FOUNDRY_CONNECT.md) before creating a public development tunnel.

## Error shape

All handled errors return:

```json
{
  "error": {
    "code": "match_not_found",
    "message": "Match not found: does-not-exist"
  }
}
```

Validation failures use `code: "validation_error"` and may include a `details` array from Pydantic. Database internals and stack traces are never returned.

| HTTP | Typical codes |
|------|----------------|
| 404 | `match_not_found`, `event_not_found`, `dataset_not_found` |
| 422 | `validation_error`, `invalid_limit`, `invalid_offset`, `insufficient_evidence` |
| 500 | `internal_error` |

## Pagination

List endpoints that can grow use:

```json
{
  "items": [],
  "total": 0,
  "limit": 50,
  "offset": 0
}
```

Query params: `limit` (1…`MAX_PAGE_LIMIT`, default `DEFAULT_PAGE_LIMIT`), `offset` (≥ 0).

## Endpoints

### `GET /api/v1/health`

```json
{
  "status": "ok",
  "service": "rematch-backend",
  "version": "0.8.0"
}
```

### `GET /api/v1/matches`

Filters (all optional):

| Param | Description |
|-------|-------------|
| `status` | `live` \| `finished` \| `upcoming` |
| `competition` | Case-insensitive exact competition name |
| `q` | Substring search over competition and home/away team name / shortName |
| `limit` / `offset` | Pagination |

`items[]` match the frontend `MatchSummary` shape (camelCase), including `provenance` and `scenarioId`.

### `GET /api/v1/matches/{match_id}`

Returns one `MatchSummary`. Unknown IDs → **404** `match_not_found`.

### `GET /api/v1/matches/{match_id}/events`

Paginated `MatchEvent` discriminated union. Unknown match → **404**. Match with no events → `items: []`, `total: 0`.

### `GET /api/v1/matches/{match_id}/frames`

Paginated `MatchFrame` objects. Unknown match → **404**.

### `GET /api/v1/matches/{match_id}/players`

Players referenced by the match’s events or frames. Unknown match → **404**.

### `GET /api/v1/matches/dataset`

Returns `MatchDatasetInfo` for `rematch-phase8-v1` when it is seeded, otherwise the most recently updated available scenario. The match catalogue continues to include both Phase 4 compatibility fixtures and Phase 8 generated fixtures.

### `GET /api/v1/matches/overview`

Dashboard catalogue counts and the count of pass/carry events with start/end coordinates plus shots with location coordinates (`DashboardOverviewStat[]`). All values are explicitly labelled as synthetic/demo data; the analysis-moment count is a count of coordinate-backed candidates, not a count of completed analyses or match importance.

### `GET /api/v1/system-metrics`

Returns measured, append-only API-operation telemetry. This endpoint never
derives runs, latency, success rates, or verifier outcomes from synthetic match
fixtures. Query parameters are optional:

| Param | Values | Default |
|-------|--------|---------|
| `range` | `24h`, `7d`, `30d`, `all` | `7d` |
| `operation` | `all`, `analysis`, `verification` | `all` |

The response contains `operations` (attempts, outcome counts, success rate,
average latency, and P95 latency), `verification` status totals, and an
explicitly unavailable `fallbackUsage` value while the deterministic engine has
no fallback path. `catalogueCoverage` is a separate, live calculation of
coordinate/type eligibility in the current catalogue; it is not operational
telemetry and carries its provenance. A fresh deployment returns zero attempts
and `null` rate/latency values until a measured operation occurs.

---

## Decision analysis (Phase 5)

On-demand geometric scoring. No persistence tables. No LLM. See [decision-engine.md](./decision-engine.md).

Decision candidates: `pass`, `shot`, `carry` with enough coordinates to score the observed action.

### `GET /api/v1/matches/{match_id}/events/{event_id}/decision-analysis`

Returns a `DecisionAnalysis` document.

| HTTP | When |
|------|------|
| 200 | Event is analyzable; response includes scores, optional alternatives, claims, completeness |
| 404 | `match_not_found` or `event_not_found` (including event belonging to another match) |
| 422 | `insufficient_evidence` — event exists but type/coords cannot support analysis |

Example:

```bash
curl "http://localhost:8000/api/v1/matches/m-northgate-riverside-2401/events/evt-ng-carry-64/decision-analysis"
```

Response (abridged):

```json
{
  "matchId": "m-northgate-riverside-2401",
  "eventId": "evt-ng-carry-64",
  "eventType": "carry",
  "teamId": "team-northgate",
  "playerId": "player-northgate-11",
  "isHomeTeam": true,
  "scoringMethodId": "geometric_progression_v1",
  "scoringMethodVersion": "1.0.0",
  "scoringAssumptions": [
    "Home team attacks toward x=100; away toward x=0."
  ],
  "observed": {
    "actionId": "observed:evt-ng-carry-64",
    "kind": "observed_carry",
    "label": "Observed carry",
    "start": { "x": 35.0, "y": 30.0 },
    "end": { "x": 52.0, "y": 44.0 },
    "targetPlayerId": null,
    "metrics": [
      {
        "name": "composite_score",
        "status": "available",
        "value": 36.63380605388592,
        "unit": "pitch_percent",
        "formula": "progressive_distance(start, end, is_home) + goal_proximity_gain(start, end, is_home)",
        "inputs": {}
      }
    ],
    "compositeScore": 36.63380605388592,
    "rankable": true,
    "limitations": []
  },
  "alternatives": [
    {
      "actionId": "alt-pass:evt-ng-carry-64:player-northgate-9",
      "kind": "hypothetical_pass",
      "label": "Hypothetical pass to player-northgate-9",
      "targetPlayerId": "player-northgate-9",
      "compositeScore": 68.61908306227392,
      "rankable": true
    }
  ],
  "ranking": [
    {
      "rank": 1,
      "actionId": "alt-pass:evt-ng-carry-64:player-northgate-9",
      "kind": "hypothetical_pass",
      "compositeScore": 68.61908306227392,
      "rankable": true
    },
    {
      "rank": 2,
      "actionId": "observed:evt-ng-carry-64",
      "kind": "observed_carry",
      "compositeScore": 36.63380605388592,
      "rankable": true
    }
  ],
  "claims": [
    {
      "id": "claim-observed-score:evt-ng-carry-64",
      "statement": "Observed carry has composite geometric score …",
      "status": "verified",
      "evidence": [
        { "kind": "event", "id": "evt-ng-carry-64", "matchId": "m-northgate-riverside-2401" },
        { "kind": "calculation", "id": "calc:observed:evt-ng-carry-64:composite_score", "matchId": "m-northgate-riverside-2401" }
      ],
      "reason": "…",
      "limitations": []
    }
  ],
  "completeness": {
    "level": "complete",
    "hasCoordinates": true,
    "hasAlignedFrame": true,
    "teammatePositionsInFrame": 2,
    "opponentPositionsInFrame": 1,
    "alternativeCount": 1,
    "missing": [],
    "notes": []
  },
  "confidence": "high",
  "limitations": [
    "Synthetic demo data — not official match statistics."
  ],
  "context": {
    "playerName": "Leo Park",
    "frameId": "frm-ng-64",
    "nearest_opponent_distance": 15.0
  },
  "provenance": "synthetic"
}
```

### `GET /api/v1/matches/{match_id}/events/{event_id}/decision-analysis/evidence`

Returns the verified claims plus catalog ids (`calculationIds`, `frameIds`, `eventIds`) for the same analysis. Same 404 / 422 behaviour as the analysis endpoint.

### `POST /api/v1/matches/{match_id}/events/{event_id}/decision-analysis/verify`

Body:

```json
{
  "claims": [
    {
      "id": "user-1",
      "statement": "Uses a real event",
      "status": "unsupported",
      "evidence": [
        {
          "kind": "event",
          "id": "evt-ng-carry-64",
          "matchId": "m-northgate-riverside-2401"
        }
      ],
      "reason": "",
      "limitations": []
    }
  ]
}
```

Returns the claims with engine-assigned `status` and `reason` after catalog validation, plus explicit validation-scope fields. The request schema is unchanged. The legacy `status` remains unchanged and mirrors `evidenceValidationStatus`; `verified` means only that the references (and supplied registered calculation value) passed validation. `claimSupportStatus` is always `not_assessed`: this endpoint does not evaluate natural-language truth.

Each response item also contains:

| Field | Meaning |
|-------|---------|
| `evidenceValidationStatus` | The result of evidence-reference and registered-calculation checks; mirrors legacy `status`. |
| `claimSupportStatus` | Always `not_assessed`; no semantic truth evaluation is performed. |
| `validationMethod` | `match_event_evidence_catalog_v1` identifies the evidence catalog used. |
| `validationScope` | `evidence_reference_membership_and_registered_calculation_consistency` describes the performed checks. |
| `limitations` | Includes that valid references/calculation IDs do not prove the statement true, and that `geometric_progression_v1` is not xG or a pass-success probability. |

Claim statuses:

| Status | Meaning |
|--------|---------|
| `verified` | Legacy evidence-validation status: all refs are valid (and supplied calculation values match). It does not mean the statement is true. |
| `partially_supported` | Evidence validation found a mix of valid and invalid references, or could not fully validate a supplied calculation. |
| `unsupported` | No valid references, no evidence, or an inconsistent registered calculation. |

### `GET /api/v1/matches/{match_id}/events/{event_id}/event-intelligence`

Evidence-grounded bilingual moment briefing for **any** stored event type (not only decision candidates). Response includes `statements` with tiers `fact` | `metric` | `hypothesis` | `missing`, progressive narrative sections, and `llmConnected`.

- Deterministic templates always run first.
- When backend `LLM_*` settings are enabled, the API may enrich English/Arabic wording from a **verified evidence pack** only. See [llm-provider.md](./llm-provider.md).
- `llmConnected` is `true` only after a successful validated provider call; otherwise deterministic text is returned and `llmConnected` stays `false`.
- Nested `decisionAnalysis` is present when the event is an analyzable decision candidate with sufficient evidence.

### `GET /api/v1/matches/{match_id}/events/{event_id}/decision-analysis/narrative`

Runs Match Intelligence once, retains that analysis's in-memory evidence catalog, validates its structured claims, and passes the typed match/event/analysis and adapted verification results to the deterministic Narrator.

The response contains `matchId`, `eventId`, `provenance`, the unchanged `analysis` object, native Agent 3 `verificationResults`, and `narrative` with English and Arabic headline, observations, and limitations. Each verification result keeps `evidenceValidationStatus` separate from `claimSupportStatus`, which is always `not_assessed`. The analysis's legacy claim statuses describe evidence validation; neither they nor valid references prove natural-language truth. The route is read-only and has the same 404 and 422 analysis error behavior.

---

## Provenance

Seeded entities return `"provenance": "synthetic"`. Decision analysis inherits the event’s provenance. The presence of an HTTP response does **not** change provenance to `"api"`.

## Frontend mapping

| Frontend `MatchService` | Path | Shape note |
|-------------------------|------|------------|
| `getMatches` | `GET /api/v1/matches` | Unwrap `{ items, total, limit, offset }` → array |
| `getMatchById` | `GET /api/v1/matches/{id}` | Compatible `MatchSummary` |
| `getMatchEvents` | `GET /api/v1/matches/{id}/events` | Unwrap `.items` |
| `getMatchFrames` | `GET /api/v1/matches/{id}/frames` | Unwrap `.items` |
| `getMatchPlayers` | `GET /api/v1/matches/{id}/players` | Compatible array |
| `getDatasetInfo` | `GET /api/v1/matches/dataset` | Compatible |
| `getOverviewStats` | `GET /api/v1/matches/overview` | Compatible |
| `getDecisionAnalysis` | `GET …/decision-analysis` | Maps 404 → `DecisionNotFoundError`; 422 → `DecisionInsufficientEvidenceError` |

**Phase 9:** `createApiMatchService` calls versioned `/api/v1/…` paths. Set `VITE_MATCH_DATA_SOURCE=api` and `VITE_API_BASE_URL=http://localhost:8000` to use the seeded engine and Phase 8 dataset. Mock mode remains the default and stays independently usable.

The Decision Explorer UI calls **only** `getDecisionAnalysis`. Claims and verification statuses arrive inside that document. Separate `…/evidence` and `…/verify` endpoints remain available for tooling and later phases; they are not required for the explorer panel.

## CORS

Configure `CORS_ORIGINS` (comma-separated). Local defaults: `http://localhost:5173`, `http://127.0.0.1:5173`. Allowed methods: `GET`, `POST`, `OPTIONS`. Empty value disables CORS middleware.

## Out of scope

AI-generated explanations, Microsoft Foundry, streaming, authentication, and unsupported football metrics (xG, possession %, etc.). Pick Your Pass consumes returned backend alternatives; there is no candidate-submission endpoint.
