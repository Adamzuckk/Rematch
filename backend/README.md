# ReMatch Backend (Phases 4–9)

FastAPI match catalogue API with SQLAlchemy models, Alembic migrations, the deterministic Phase 4 + Phase 8 synthetic seeds, and an on-demand decision-analysis engine with evidence verification. Phase 8 is the preferred dataset context; both scenarios remain in the catalogue for compatibility.

**Python:** 3.11–3.14 (developed/tested on 3.12).  
**Stack:** FastAPI, Pydantic v2, SQLAlchemy 2.x, Alembic, SQLite (local) / PostgreSQL-compatible URL.

The local demo uses synthetic data only. Decision analysis and the Narrator remain deterministic. Optional **server-side** LLM enrichment can rewrite event-intelligence briefings when `LLM_*` / `GEMINI_*` env vars are set (OpenAI-compatible or Google Gemini via `google-genai`; see [docs/llm-provider.md](../docs/llm-provider.md)). API keys never belong in the frontend. Microsoft Foundry remains an external tooling path documented separately. Optional bearer authentication is available for exposing the API through a development tunnel.

For the reviewed Azure Container Apps container setup, resource/cost prerequisites, and deployment validation steps, see [docs/AZURE_CONTAINER_APPS.md](../docs/AZURE_CONTAINER_APPS.md). The guide does not imply that a cloud deployment or Foundry connection has been performed.

## Quick start

```bash
cd backend
python3.12 -m venv .venv          # or python3.11+
source .venv/bin/activate
uv sync --locked --extra dev
cp .env.example .env

# Create schema
alembic upgrade head

# Seed both synthetic scenarios (idempotent; Phase 8 is the preferred dataset)
rematch-seed
# or: python -m app.services.seed

# Run API
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- OpenAPI docs: http://localhost:8000/docs (development only)  
- Health: http://localhost:8000/api/v1/health  

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `APP_NAME` | `ReMatch API` | OpenAPI title |
| `APP_ENV` | `development` | Environment label |
| `DEBUG` | `false` | Reserved; stack traces are never returned to clients |
| `REQUIRE_API_AUTH` | `false` | Require a bearer token for all `/api/v1` routes |
| `API_BEARER_TOKEN` | unset | Secret bearer token; required when `REQUIRE_API_AUTH=true`, at least 32 characters |
| `DATABASE_URL` | `sqlite:///./rematch.db` | SQLAlchemy URL |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated browser origins. Empty disables CORS |
| `DEFAULT_PAGE_LIMIT` | `50` | Default list page size |
| `MAX_PAGE_LIMIT` | `100` | Hard cap for `limit` |
| `LLM_ENABLED` | `false` | Enable optional event-intelligence LLM enrichment |
| `LLM_PROVIDER` | `openai` | `openai`, `azure_openai`, `openai_compatible`, or `gemini` |
| `LLM_API_KEY` | unset | OpenAI / Azure / compatible secret (`SecretStr`); not used for Gemini |
| `LLM_MODEL` | `gpt-4o-mini` | Chat model or Azure deployment model name |
| `LLM_BASE_URL` | unset | OpenAI override, Azure endpoint, or compatible base URL |
| `LLM_AZURE_DEPLOYMENT` | unset | Required for `azure_openai` |
| `LLM_AZURE_API_VERSION` | `2024-10-21` | Azure OpenAI API version |
| `LLM_TIMEOUT_SECONDS` | `20` | Outbound provider timeout |
| `LLM_MAX_TOKENS` | `1200` | Completion token cap |
| `LLM_MAX_RETRIES` | `2` | Bounded retries for transient provider failures |
| `LLM_CACHE_MAX_ENTRIES` | `128` | In-process identical-prompt cache (`0` disables) |
| `LLM_CACHE_TTL_SECONDS` | `3600` | Cache TTL seconds |
| `GEMINI_API_KEY` | unset | Gemini Developer API key; required when `LLM_PROVIDER=gemini` and enabled |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Gemini model id (currently supported default) |

Full LLM / Gemini setup: [docs/llm-provider.md](../docs/llm-provider.md). Never commit real keys.

`uv.lock` is the canonical dependency graph. `requirements.txt` is the
hash-checked, production-only export used by the Docker build. Refresh both
together after an intentional dependency update:

```bash
uv lock
uv export --locked --no-dev --no-emit-project --format requirements-txt --output-file requirements.txt
```

When `APP_ENV=production` (or `prod`), `/docs`, `/redoc`, and `/openapi.json`
are disabled. Local development keeps them enabled.

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

- `rematch-phase4-v1`: sparse compatibility fixtures, including Northgate–Riverside frame samples.
- `rematch-phase8-v1`: three generated matches, full 11v11 rosters, 67 events, and 43 aligned decision frames.
- Both have version `1.0.0` and `synthetic` provenance.
- Re-running the seed updates stable IDs rather than duplicating teams, players, matches, events, or frames.
- All clubs and competitions are fictional.

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
| GET | `/api/v1/matches/dataset` | Phase 8 metadata when seeded; otherwise latest available scenario |
| GET | `/api/v1/matches/overview` | Counts from seeded data; the analysis moment count requires scoring coordinates |
| GET | `/api/v1/system-metrics` | Stored API-operation telemetry; filters: `range`, `operation` |
| GET | `/api/v1/matches/{id}/events/{event_id}/decision-analysis` | Geometric decision analysis |
| GET | `/api/v1/matches/{id}/events/{event_id}/decision-analysis/narrative` | Composed analysis + verifier + Narrator |
| GET | `/api/v1/matches/{id}/events/{event_id}/event-intelligence` | Evidence briefing; optional LLM enrichment |
| GET | `/api/v1/matches/{id}/events/{event_id}/decision-analysis/evidence` | Verified claims + evidence catalog |
| POST | `/api/v1/matches/{id}/events/{event_id}/decision-analysis/verify` | Validate caller-supplied claims |

## Tests

```bash
pytest
```

## CORS

Local Vite origins are listed in `.env.example`. Leaving `CORS_ORIGINS` empty disables CORS middleware. There is **no** wildcard production CORS default. CORS is unrelated to API authentication and does not protect a public tunnel.

## Frontend integration boundary

- Response shapes use camelCase fields matching `rematch-frontend` domain types (`MatchSummary`, `MatchEvent`, `MatchFrame`, `DecisionAnalysis`, …).
- List endpoints wrap items in `{ items, total, limit, offset }` — the Phase 6 API client unwraps `.items`.
- Frontend `createApiMatchService` calls `/api/v1/…`. Set `VITE_MATCH_DATA_SOURCE=api` and `VITE_API_BASE_URL=http://localhost:8000` to use the live engine.
- Mock mode remains the frontend default; API errors must not silently fall back to mocks.
- Phase 8 Decision Explorer demo: choose an event-aligned frame from `m-p8-harbor-eastbridge-002`, then request its `…/decision-analysis` endpoint. The live smoke script does this dynamically.

## Coordinate convention

Stored and returned as the same 0–100 `PitchPoint` space as `rematch-frontend/src/types/coordinates.ts`. No unit conversion on the wire. See `app/simulation/coordinates.py`.

## Decision analysis

See [docs/decision-engine.md](../docs/decision-engine.md). Scoring is `geometric_progression_v1` (deterministic Python). Alternatives require an aligned frame. Unsupported event types / missing coordinates return `422 insufficient_evidence`.

Pick Your Pass uses the alternatives returned by `GET /api/v1/matches/{id}/events/{event_id}/decision-analysis`. Each frame-backed alternative already includes its candidate geometry, backend-computed metrics/composite score and ranking entry. The client selects among those returned records; there is no candidate submission/evaluation endpoint and the client does not calculate scores. Alternatives are sparse-frame hypotheticals and do not predict pass completion.

## System metrics

`GET /api/v1/system-metrics` reports append-only, request-level telemetry for
decision analysis and claim verification operations. It supports `range=24h|7d|30d|all`
and `operation=all|analysis|verification`. Telemetry begins at deployment and
is never inferred from seed data or historical access logs. The endpoint also
reports separately scoped decision-engine eligibility calculated from the
current catalogue; that coverage is not an analysis-request count. Static
frontend mock mode has no operational history and deliberately displays no
substitute values.

## Agent 2 — Narrator

The deterministic bilingual Narrator accepts typed Agent 1 match/event/decision records and optional verifier results as a `MatchIntelligenceTruthPack`. It produces English and Arabic headlines, observations, and limitations; it does not fetch data, call a model, or connect external orchestration. The composed read-only route is `GET /api/v1/matches/{match_id}/events/{event_id}/decision-analysis/narrative`. See [docs/narrator.md](../docs/narrator.md) for its contract.

Run the focused Narrator tests from `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_narrator.py
```

## Agent 3 — Verifier

The verifier accepts Agent 1's structured claims and actual evidence catalog on the composed narrative route. It reuses the existing reference and calculation checks and always reports natural-language claim support as `not_assessed`. See [docs/verifier.md](../docs/verifier.md) for the contract and limitations.

Run its focused tests from `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_verifier.py tests/test_decision_evidence.py
```

Run the composed endpoint and OpenAPI contract tests from `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_match_intelligence_integration.py tests/test_foundry_openapi_contract.py
```

## Known limitations

- No user accounts or per-user authorization. Optional shared bearer-token protection is provided for development tunnels only.
- No WebSocket event stream
- No AI / Foundry explanations
- No xG or probability metrics
- Synthetic seed only
- SQLite for local demo; Postgres URL supported but not required
