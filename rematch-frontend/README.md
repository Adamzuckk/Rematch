# ReMatch Frontend

React + TypeScript + Vite UI for **ReMatch** (Dark Pro sports analytics).

## Scripts

```bash
npm install
npm run dev         # local development server
npm run test        # Vitest (deterministic unit/UI tests)
npm run test:watch  # Vitest watch mode
npm run lint        # ESLint
npm run typecheck   # TypeScript project references check
npm run build       # TypeScript project build + Vite production bundle
npm run preview     # preview the production build
```

## Environment

Copy `.env.example` to `.env` if you need non-default data wiring:

| Variable | Default | Notes |
|----------|---------|-------|
| `VITE_MATCH_DATA_SOURCE` | `mock` | Use `api` only when a backend is available |
| `VITE_API_BASE_URL` | empty | Required for `api`; never commit secrets |

Default development uses the synthetic mock service. The API client never silently falls back to mocks on failure.

## Phase status

- **Phase 1:** App shell, routing, dashboard with synthetic catalogue, EN/AR shell toggle
- **Phase 2:** Strict domain types, `rematch-phase2-v1` synthetic modules, match service boundary, Dashboard loads via service, Vitest coverage
- **Phase 3 (current):** Match Analysis — SVG pitch, event timeline/navigation, event inspector; frames optional (seed has none)

See `../docs/data-model.md` for models, coordinates, provenance, and how to add a scenario.

## Synthetic data

Seed / scenario: **`rematch-phase2-v1`** (`src/mocks/`).

Fictional competitions and clubs only. The Dashboard shows the scenario id and `synthetic` provenance; match cards carry a “Synthetic demo data” badge.
