# ReMatch API contract (Phase 5–6)

Base URL (local): `http://localhost:8000`  
Versioned prefix: `/api/v1`  
OpenAPI UI: `/docs` · ReDoc: `/redoc` · Schema: `/openapi.json`

Authentication is **not** implemented.

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
  "version": "0.5.0"
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

Active seeded scenario metadata (`MatchDatasetInfo`).

### `GET /api/v1/matches/overview`

Demo dashboard chips (`DashboardOverviewStat[]`). Values are labelled demo placeholders.

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

Returns the claims with engine-assigned `status` and `reason` after catalog validation. Does not invent supporting evidence.

Claim statuses:

| Status | Meaning |
|--------|---------|
| `verified` | All refs valid (and calculation values match when provided) |
| `partially_supported` | Some refs valid / claim cannot be fully established |
| `unsupported` | No valid justification from available data |

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

**Phase 6:** `createApiMatchService` calls versioned `/api/v1/…` paths. Set `VITE_MATCH_DATA_SOURCE=api` and `VITE_API_BASE_URL=http://localhost:8000` to use the live engine. Mock mode remains the default and stays independently usable.

The Decision Explorer UI calls **only** `getDecisionAnalysis`. Claims and verification statuses arrive inside that document. Separate `…/evidence` and `…/verify` endpoints remain available for tooling and later phases; they are not required for the explorer panel.

## CORS

Configure `CORS_ORIGINS` (comma-separated). Local defaults: `http://localhost:5173`, `http://127.0.0.1:5173`. Allowed methods: `GET`, `POST`, `OPTIONS`. Empty value disables CORS middleware.

## Out of scope (later phases)

AI-generated explanations, Microsoft Foundry, Pick Your Pass, streaming, authentication, and unsupported football metrics (xG, possession %, etc.).
