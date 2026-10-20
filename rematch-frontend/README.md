# ReMatch Frontend

React + TypeScript + Vite UI for **ReMatch** (Dark Pro sports analytics).

## Scripts

```bash
npm install
npm run dev         # local development server
npm run dev:api     # API-backed local development (requires seeded FastAPI at 127.0.0.1:8000)
npm run test        # Vitest (deterministic unit/UI tests)
npm run test:watch  # Vitest watch mode
npm run lint        # ESLint
npm run typecheck   # TypeScript project references check
npm run build       # TypeScript project build + Vite production bundle
npm run preview     # preview the production build
npm run smoke:decision  # optional live-backend smoke (see below)
```

## Environment

Copy `.env.example` to `.env` if you need non-default data wiring:

| Variable | Default | Notes |
|----------|---------|-------|
| `VITE_MATCH_DATA_SOURCE` | `mock` | `mock` (offline synthetic catalogue) or `api` |
| `VITE_API_BASE_URL` | empty | Required for `api`; no trailing slash (e.g. `http://localhost:8000`) |

Default development uses the synthetic mock service. The API client **never** silently falls back to mocks on failure — errors are shown with a retry action.

### Mock vs API mode

**Mock (default):**

```bash
VITE_MATCH_DATA_SOURCE=mock
```

Decision Explorer uses static synthetic fixtures under `src/mocks/decisionAnalysis.ts`. Fixtures are labelled in the UI (`mockFixture` banner). They have **empty alternatives** because the Phase 2 mock catalogue has no frames.

**API (live engine):**

```bash
npm run dev:api
```

This command loads the checked-in `.env.api` with `VITE_MATCH_DATA_SOURCE=api` and `VITE_API_BASE_URL=http://127.0.0.1:8000`. It requires the FastAPI backend running with `rematch-seed` applied. Vite uses port 5173 when free and can fall back to 5174; the backend's local CORS defaults allow both ports and both `localhost`/`127.0.0.1` hostnames. The ordinary `npm run dev` remains explicit offline mock mode.

Demo path with frame-backed alternatives:

`/matches/m-p8-harbor-eastbridge-002/decisions/m-p8-harbor-eastbridge-002-evt-001-pass`

## Phase status

- **Phase 1–3:** App shell, dashboard, Match Analysis (pitch + timeline)
- **Phase 4–5:** Backend catalogue + `geometric_progression_v1` decision engine
- **Phase 6–7:** Decision Explorer and Pick Your Pass consume backend-returned scores, ranks, claims, and frame-backed coordinates (mock + API)
- **Phase 8–9:** API mode can browse the Phase 8 seeded fixtures and follow an aligned event through match analysis into decision comparison; mock mode remains explicit and sparse

## Decision Explorer

| Route | Page |
|-------|------|
| `/matches/:matchId` | Match Analysis — select pass/shot/carry → Open Decision Explorer |
| `/matches/:matchId/decisions/:eventId` | Decision Explorer — scores, ranking, claims, completeness |

Backend is the source of truth for scores and ranking. The UI does not recompute geometric scores.

## Optional smoke test

Against a locally running seeded backend:

```bash
# terminal 1 — backend
cd ../backend && source .venv/bin/activate && uvicorn app.main:app --port 8000

# terminal 2 — Phase 8 match → event/frame → decision-analysis smoke
npm run smoke:decision
```

Not part of `npm run test`. Reports PASS/FAIL and whether the backend was reachable.

## Synthetic data

Frontend mock seed: **`rematch-phase2-v1`** (`src/mocks/`).  
Backend API mode seeds **`rematch-phase4-v1`** compatibility fixtures and **`rematch-phase8-v1`** generated fixtures. The API dataset endpoint identifies Phase 8 as the preferred dataset context when present.

Fictional competitions and clubs only. Provenance stays `synthetic` and is labelled in the UI.
