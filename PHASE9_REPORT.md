# Phase 9 — Production Readiness & End-to-End Validation

## Summary

Phase 8 data is now the preferred dataset context when both Phase 4 and Phase 8 are seeded. The match catalogue still includes both scenarios. The dashboard's decision-moment value is calculated from database events that have the coordinates required by the geometric scorer instead of using a fixed placeholder.

The API journey was exercised from dataset metadata through match detail, events, frames, players, and decision analysis. A full-XI frame is now described accurately in claims and limitations: claims about roster destinations are verified against the frame and teammate position references; sparse Phase 4 frames remain explicitly partial. Geometric scores remain backend-only, and neither a higher score nor a roster-complete snapshot predicts pass success or establishes an objectively correct choice.

## Changes

- Prefer `rematch-phase8-v1` in `GET /api/v1/matches/dataset`; fall back to the latest available scenario when Phase 8 has not been seeded.
- Replace the hard-coded dashboard decision-moment count with a query for passes/carries with start and end coordinates and shots with location coordinates.
- Make decision-analysis evidence claims and limitations reflect actual full-XI or sparse frame coverage.
- Add backend API integration tests that walk Phase 8 catalog → match → event/frame/player data → analysis, verify candidates end at actual frame positions, and cover missing/unsupported inputs.
- Replace the empty Decision Explorer page test file with Pick Your Pass selection, path, returned-value, unavailable-data, missing-coordinate, and Arabic RTL coverage.
- Expand `smoke:decision` into a live Phase 8 journey check for the seeded API, including 404 and 422 cases.
- Update API, setup, dataset, and phase documentation.

## Validation Results

| Check | Result |
|---|---|
| Backend full test suite | **Pass** — 73 passed, 1 Starlette/httpx deprecation warning |
| Frontend full test suite | **Pass** — 13 files, 64 tests passed |
| Frontend ESLint | **Pass** |
| Frontend TypeScript typecheck | **Pass** |
| Frontend production build | **Pass** — Vite transformed 1,999 modules |
| Alembic migration on a fresh temporary SQLite database | **Pass** — initial schema + Phase 8 metric migration |
| Idempotent seed command | **Pass** — Phase 4: 6 matches/9 events/3 frames; Phase 8: 3 matches/67 events/43 frames |
| Live API journey smoke | **Pass** — Phase 8 dataset, 22-player match, aligned pass, 9 returned alternatives, missing/unsupported responses |
| Browser journey | **Pass** — actual API-mode dashboard → Phase 8 match analysis → Decision Explorer; selected an alternative and confirmed the pitch path and displayed score/rank came from the API response |

The API-mode dashboard showed 9 catalog matches across the two seeded scenarios and 49 coordinate-backed decision moments across those events. The Phase 8 dataset itself contains 43 generated aligned decision frames. These counts have different scopes and are not outcomes or quality metrics.

During validation, one parallel frontend run hit a 5-second timeout in an existing Dashboard search test under worker contention. That test passed when rerun alone; the final full suite passed with file parallelism disabled. No failing test remains.

## Exact Commands

Commands below were run from PowerShell. Python 3.12 was supplied by the local Codex runtime; the standard Python launcher only had Python 3.10, which does not satisfy `requires-python >=3.11`.

### Backend environment, migration, seed, and server

```powershell
cd backend
& "C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -e '.[dev]' --disable-pip-version-check
$env:DATABASE_URL = 'sqlite:///C:/Users/Admin/AppData/Local/Temp/rematch-phase9-smoke.db'
& .\.venv\Scripts\python.exe -m alembic upgrade head
& .\.venv\Scripts\python.exe -m app.services.seed
$env:CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174'
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Backend tests:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

### Frontend server and checks

```powershell
cd rematch-frontend
$env:VITE_MATCH_DATA_SOURCE = 'api'
$env:VITE_API_BASE_URL = 'http://127.0.0.1:8000'
npm run dev -- --host 127.0.0.1 --port 5173
```

Port 5173 was already occupied in this environment, so Vite served the API-mode app at `http://127.0.0.1:5174/`.

```powershell
cd rematch-frontend
npm test -- --pool=threads --no-file-parallelism
npm run lint
npm run typecheck
npm run build
npm run smoke:decision
```

### Internet and dependency availability

- `Test-NetConnection pypi.org -Port 443` and the equivalent npm registry probe failed from the restricted shell.
- Backend dependencies were installed into `backend/.venv` when the package installation was run with escalated network access. Frontend dependencies were already present under `rematch-frontend/node_modules`.
- No network-only dependency was added to the project; installation used the versions allowed by `pyproject.toml`.

## What Works

- Both synthetic seeds are applied by the existing `rematch-seed` command; the API catalogue can browse all nine matches.
- `/matches/dataset` now advertises Phase 8 when available and continues to work with Phase 4-only databases.
- `/matches/overview` reports database-backed match counts and coordinate-backed candidate counts.
- API-mode match selection exposes Phase 8 events, aligned full-XI frames, players, and the existing decision engine output.
- The live Phase 8 browser journey displayed 9 backend-generated destinations. Selecting a destination highlighted the exact frame-backed path and showed the returned score/rank and verified claim. A negative geometric score was displayed unchanged from the backend.
- Existing Phase 4 sparse-frame tests still pass and retain partial-support status.
- Mock mode remains explicit, labeled synthetic, and separate from API mode; API errors do not fall back to mock data.
- English and Arabic component coverage passes; Arabic sets the document direction to RTL.

## Known Limitations / Manual Verification

- All shipped matches and events are synthetic. No official match feed or production data rights were reviewed.
- A full-XI frame covers the seeded roster in one snapshot only. It does not model continuous movement, pressure, passing lanes, defender reach, or pass completion. `geometric_progression_v1` is not xG, probability, or proof of decision quality.
- The frontend remains in mock mode by default. Phase 8 browsing requires `VITE_MATCH_DATA_SOURCE=api`, a migrated/seeded backend, and the API base URL.
- The environment emitted one deprecation warning from the current Starlette `TestClient` integration with `httpx`; tests still pass. No new server/network security, load, deployment, mobile-device, or assistive-technology audit was performed. Those require manual review before a production launch.
- The ordinary sandbox network probes failed. Dependency installation succeeded only through the permitted escalated install path.
- No Git metadata exists in this workspace snapshot, so no repository diff or commit was produced as part of Phase 9.

## Files Created or Modified

Created:

- `PHASE9_REPORT.md`
- `backend/tests/test_phase9_integration.py`

Modified:

- `README.md`
- `backend/README.md`
- `backend/app/main.py`
- `backend/app/services/decision/engine.py`
- `backend/app/services/matches.py`
- `docs/api-contract.md`
- `docs/data-generator.md`
- `rematch-frontend/README.md`
- `rematch-frontend/scripts/decision-smoke.mjs`
- `rematch-frontend/src/pages/DecisionExplorerPage.test.tsx`
