# ReMatch Backend (Phase 5; consumed by Phase 6 UI)

FastAPI match catalogue API with SQLAlchemy models, Alembic migrations, a deterministic synthetic seed (`rematch-phase4-v1`), and an on-demand decision-analysis engine with evidence verification.

**Python:** 3.11–3.14 (developed/tested on 3.12).  
**Stack:** FastAPI, Pydantic v2, SQLAlchemy 2.x, Alembic, SQLite (local) / PostgreSQL-compatible URL.

This phase does **not** include AI explanations, Microsoft Foundry, streaming, or authentication.

## Quick start

```bash
cd backend
python3.12 -m venv .venv          # or python3.11+
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# Create schema
alembic upgrade head

# Seed synthetic scenario (idempotent)
rematch-seed
# or: python -m app.services.seed

# Run API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- OpenAPI docs: http://localhost:8000/docs  
- Health: http://localhost:8000/api/v1/health  

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `APP_NAME` | `ReMatch API` | OpenAPI title |
| `APP_ENV` | `development` | Environment label |
| `DEBUG` | `false` | Reserved; stack traces are never returned to clients |
| `DATABASE_URL` | `sqlite:///./rematch.db` | SQLAlchemy URL |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated browser origins. Empty disables CORS |
| `DEFAULT_PAGE_LIMIT` | `50` | Default list page size |
| `MAX_PAGE_LIMIT` | `100` | Hard cap for `limit` |

PostgreSQL example:

```bash
DATABASE_URL=postgresql+psycopg://rematch:rematch@localhost:5432/rematch
```

Install a PostgreSQL driver (e.g. `psycopg[binary]`) when using Postgres. Do not commit `.env` or secrets.

## Migrations

```bash
alembic upgrade head
alembic downgrade -1
alembic revision --autogenerate -m "describe change"   # review before applying
```

Production code must not rely on `Base.metadata.create_all`; tests may create tables in-memory.

## Seeding

```bash
rematch-seed
```

- Scenario ID: `rematch-phase4-v1`
- Version: `1.0.0`
- Provenance: `synthetic`
- Idempotent: re-running updates the same primary keys; it does not duplicate teams, players, matches, events, or frames
- Fictional clubs only (aligned with frontend Phase 2 IDs where possible)
- Includes sparse events plus three Northgate–Riverside player/ball frames

## API prefix

All routes live under `/api/v1`. See [docs/api-contract.md](../docs/api-contract.md).

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/v1/health` | Liveness |
| GET | `/api/v1/matches` | Paginated list; filters: `status`, `competition`, `q` |
| GET | `/api/v1/matches/{match_id}` | Match summary |
| GET | `/api/v1/matches/{match_id}/events` | Paginated events |
| GET | `/api/v1/matches/{match_id}/frames` | Paginated frames |
| GET | `/api/v1/matches/{match_id}/players` | Players referenced by events/frames |
| GET | `/api/v1/matches/dataset` | Active scenario metadata |
| GET | `/api/v1/matches/overview` | Demo overview chips |
| GET | `/api/v1/matches/{id}/events/{event_id}/decision-analysis` | Geometric decision analysis |
| GET | `/api/v1/matches/{id}/events/{event_id}/decision-analysis/evidence` | Verified claims + evidence catalog |
| POST | `/api/v1/matches/{id}/events/{event_id}/decision-analysis/verify` | Validate caller-supplied claims |

## Tests

```bash
pytest
```

## CORS

Local Vite origins are listed in `.env.example`. Leaving `CORS_ORIGINS` empty disables CORS middleware. There is **no** wildcard production CORS default.

## Frontend integration boundary

- Response shapes use camelCase fields matching `rematch-frontend` domain types (`MatchSummary`, `MatchEvent`, `MatchFrame`, `DecisionAnalysis`, …).
- List endpoints wrap items in `{ items, total, limit, offset }` — the Phase 6 API client unwraps `.items`.
- Frontend `createApiMatchService` calls `/api/v1/…`. Set `VITE_MATCH_DATA_SOURCE=api` and `VITE_API_BASE_URL=http://localhost:8000` to use the live engine.
- Mock mode remains the frontend default; API errors must not silently fall back to mocks.
- Decision Explorer demo: `GET /api/v1/matches/m-northgate-riverside-2401/events/evt-ng-carry-64/decision-analysis`

## Coordinate convention

Stored and returned as the same 0–100 `PitchPoint` space as `rematch-frontend/src/types/coordinates.ts`. No unit conversion on the wire. See `app/simulation/coordinates.py`.

## Decision analysis

See [docs/decision-engine.md](../docs/decision-engine.md). Scoring is `geometric_progression_v1` (deterministic Python). Alternatives require an aligned frame. Unsupported event types / missing coordinates return `422 insufficient_evidence`.

Pick Your Pass uses the alternatives returned by `GET /api/v1/matches/{id}/events/{event_id}/decision-analysis`. Each frame-backed alternative already includes its candidate geometry, backend-computed metrics/composite score and ranking entry. The client selects among those returned records; there is no candidate submission/evaluation endpoint and the client does not calculate scores. Alternatives are sparse-frame hypotheticals and do not predict pass completion.

## Known limitations

- No auth / authz
- No WebSocket event stream
- No AI / Foundry explanations
- No xG or probability metrics
- Synthetic seed only
- SQLite for local demo; Postgres URL supported but not required
