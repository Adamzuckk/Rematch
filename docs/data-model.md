# ReMatch data model (Phase 2–6)

Typed frontend models and the match service boundary live under `rematch-frontend/`. The Phase 4 backend stores a parallel relational schema under `backend/app/models/` and exposes camelCase JSON that mirrors the frontend domain types.

## Provenance

Every match, event, and frame carries `DataProvenance`:

| Value | Meaning |
|-------|---------|
| `synthetic` | Deterministic demo/scenario data (not official fixtures) |
| `api` | Loaded from the ReMatch backend as non-synthetic records (reserved) |
| `unavailable` | Requested but not present for this entity |

The UI must surface synthetic provenance honestly (seed label + “Synthetic demo data” badge). Do not present synthetic fixtures as official Premier League (or any league) records.

Seeded Phase 4 API responses keep `provenance: "synthetic"` even though they are served over HTTP.

## Core types (frontend)

Defined in `rematch-frontend/src/types/`:

| Type | Role | Notable optional fields |
|------|------|-------------------------|
| `Team` | Club identity | `shortName` |
| `Player` | Player identity | `shirtNumber` |
| `MatchSummary` | Dashboard / navigation match | `score`, `minute`, `venue` |
| `MatchStatus` | `live` \| `finished` \| `upcoming` | — |
| `MatchEvent` | Discriminated union by `type` | coordinates, outcomes, player/team refs |
| `MatchFrame` / `PlayerFrame` / `BallFrame` | Pitch snapshots (loaded when present) | `ball`, `eventId`, times |
| `PitchPoint` | Normalized pitch position | — |
| `MatchDatasetInfo` | Catalogue metadata | — |
| `DecisionAnalysis` | On-demand geometric analysis document | claims, ranking, completeness |

Match events use a discriminated union on `type`: `pass`, `shot`, `carry`, `tackle`, `pressure`, `possession_change`. Decision types live in `rematch-frontend/src/types/decision.ts` and mirror `backend/app/schemas/decision.py`.

**Do not invent** possession %, xG, aggregate stats, coordinates, or full squads merely to fill UI. Omit optional fields when the dataset does not supply them.

## Coordinate convention

Documented in `rematch-frontend/src/types/coordinates.ts` and `backend/app/simulation/coordinates.py`:

- Units: normalized percentage of the pitch, range **0–100** inclusive.
- **x**: along pitch length (0 = left end-line, 100 = right end-line in the default SVG orientation).
- **y**: along pitch width (0 = bottom touchline, 100 = top touchline).
- Origin: bottom-left of the pitch diagram.
- Ball and player frames share this space.

Backend storage uses FLOAT columns (`start_x`/`start_y`, `ball_x`/`ball_y`, etc.). **No transformation** is applied when serializing to JSON — API `PitchPoint` values are identical to the frontend convention. DB CHECK constraints and seed validation reject out-of-range coordinates.

`isValidPitchPoint()` (frontend) / `validate_pitch_point()` (backend) check finite values within 0–100.

## Backend relational schema (Phase 4)

| Table | Maps to frontend | Notes |
|-------|------------------|-------|
| `scenarios` | `MatchDatasetInfo` / `scenarioId` | Seed/run metadata (`id`, `version`, `description`, `provenance`) |
| `teams` | `Team` | Stable string PKs (`team-northgate`, …) |
| `players` | `Player` | FK → `teams`; unique `(team_id, shirt_number)` |
| `matches` | `MatchSummary` | FKs → `scenarios`, home/away `teams`; status check constraint |
| `match_events` | `MatchEvent` | Polymorphic columns; unused type fields stay NULL |
| `match_frames` | `MatchFrame` | Optional FK → `match_events`; optional ball x/y |
| `player_frame_positions` | `PlayerFrame` | FK → `match_frames`, `players`, `teams` |

Relationships:

```text
Scenario 1──* Match 1──* MatchEvent
                 │
                 └──* MatchFrame 1──* PlayerFramePosition
                              │
                              └──? MatchEvent (event-aligned frames)
```

Decision-analysis results are computed **on demand** in Phase 5 (no new tables). Explanation/LLM and metrics-persistence tables remain intentionally absent.

Migrations: `backend/alembic/versions/`. Do not use `create_all` as the production schema path.

## Synthetic scenarios

### Frontend mock — `rematch-phase2-v1`

| Field | Value |
|-------|-------|
| Scenario / seed ID | `rematch-phase2-v1` |
| Provenance | `synthetic` |
| Modules | `rematch-frontend/src/mocks/` |

Contents:

- 6 fictional matches across Metro Premier Cup, Coastal League, and Northern Circuit
- Team and sparse player records for event samples
- Event timelines for a **subset** of matches only (Northgate–Riverside live; Oakwood–Silvermere finished)
- **No player/ball frames** in this scenario — Match Analysis shows event locations/paths only

### Backend seed — `rematch-phase4-v1`

| Field | Value |
|-------|-------|
| Scenario / seed ID | `rematch-phase4-v1` |
| Version | `1.0.0` |
| Provenance | `synthetic` |
| Command | `rematch-seed` / `python -m app.services.seed` |

Contents:

- Same fictional team, player, match, and event **IDs** as the Phase 2 frontend catalogue (contract-compatible)
- Plus **3** coherent Northgate–Riverside frames with player + ball positions (illustrative only)
- Idempotent upserts on stable primary keys; re-running does not duplicate rows

### What Phase 3–6 can demonstrate

| Available | Missing |
|-----------|---------|
| Match header (teams, score/status, venue, provenance) | Possession %, xG, aggregate stats |
| Sparse event timelines (2 matches) | Events for the other 4 catalogue matches |
| Event coordinates / pass–carry paths when present | Full 22-player tracking |
| Backend frames for Northgate (Phase 4 seed) | Frames in the frontend Phase 2 mock |
| Team/player name resolution for event participants | Full squads |
| Decision Explorer UI for pass/shot/carry | AI / Foundry explanations |
| Backend `geometric_progression_v1` + mock/API wiring | xG, probabilities, Pick Your Pass |
| Frame-backed alternatives in **API mode** (`evt-ng-carry-64`) | Alternatives in mock mode (no frames) |

### How to add a scenario

**Frontend mock**

1. Add or extend modules under `src/mocks/`.
2. Keep a new `scenarioId` string and mark every record `provenance: 'synthetic'`.
3. Keep fixtures deterministic.
4. Wire through `mockMatchService`.
5. Update `MatchDatasetInfo.limitations` and this document.

**Backend seed**

1. Add a new module under `backend/app/simulation/` (or extend `scenario_phase4.py` with a new version id).
2. Upsert by stable primary keys inside a transaction.
3. Validate coordinates before insert.
4. Bump scenario `version` / `id` as appropriate.
5. Never label fictional clubs as real league sides.

## Match service boundary

Path: `rematch-frontend/src/services/matches/`

```ts
interface MatchService {
  getDatasetInfo(): Promise<MatchDatasetInfo>
  getOverviewStats(): Promise<DashboardOverviewStat[]>
  getMatches(filters?: MatchListFilters): Promise<MatchSummary[]>
  getMatchById(matchId: string): Promise<MatchSummary | null>
  getMatchEvents(matchId: string): Promise<MatchEvent[]>
  getMatchPlayers(matchId: string): Promise<Player[]>
  getMatchFrames(matchId: string): Promise<MatchFrame[]>
  getDecisionAnalysis(matchId: string, eventId: string): Promise<DecisionAnalysis>
}
```

- **Mock** (`mockMatchService`): works offline; default. Decision fixtures are static and labelled synthetic; alternatives are empty (no frames).
- **API** (`createApiMatchService`): HTTP client using `VITE_API_BASE_URL` and `/api/v1/…`. Errors are explicit (`MatchApiError`, `MatchNotFoundError`, `DecisionNotFoundError`, `DecisionInsufficientEvidenceError`, `MatchServiceConfigError`). There is **no** silent fallback to mock data after an API failure.

See [api-contract.md](./api-contract.md) and [decision-engine.md](./decision-engine.md).

### Switching to the API

1. Start the backend (`uvicorn` on `:8000` after `alembic upgrade head` + `rematch-seed`).
2. Copy `rematch-frontend/.env.example` to `.env`.
3. Set:

```bash
VITE_MATCH_DATA_SOURCE=api
VITE_API_BASE_URL=http://localhost:8000
```

4. Restart Vite.

If `VITE_MATCH_DATA_SOURCE=api` is set without a base URL, startup fails with a config error instead of pretending mock data is live.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_MATCH_DATA_SOURCE` | `mock` | `mock` or `api` |
| `VITE_API_BASE_URL` | _(empty)_ | Backend origin when using `api` |

Backend env vars are documented in `backend/README.md` and `backend/.env.example`.

Never commit secrets or real `.env` files.
