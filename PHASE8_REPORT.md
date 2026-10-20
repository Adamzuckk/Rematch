# Phase 8 Closure Report — Synthetic Match Generator & Data Expansion

## 1. Summary

Phase 8 delivers a **deterministic, seedable synthetic match generator** and an expanded seed dataset (`rematch-phase8-v1`) with:

- 3 complete fictional matches
- Full 11v11 rosters
- ≥10 eligible decision moments per match (43 total in the default dataset)
- 22-player + ball frames for every eligible moment
- Generator-side pass/shot path metrics (`path_metrics_v1`)
- Validation, tests, and documentation

Existing Phase 4 seed, decision engine (`geometric_progression_v1`), and Phase 7 Pick Your Pass remain compatible. No Phase 9 live replay / AI / Azure work was started.

## 2. Files Changed

| Path | Purpose |
|------|---------|
| `backend/app/simulation/generator/__init__.py` | Public generator API |
| `backend/app/simulation/generator/rng.py` | Seeded PRNG |
| `backend/app/simulation/generator/formations.py` | 4-3-3 / 4-2-3-1 templates |
| `backend/app/simulation/generator/metrics.py` | path_metrics_v1 formulas |
| `backend/app/simulation/generator/match_generator.py` | Match + Phase8 dataset builder |
| `backend/app/simulation/generator/validate.py` | Integrity checks |
| `backend/app/models/event.py` | Optional metric columns |
| `backend/alembic/versions/20261020_0002_phase8_event_metrics.py` | Migration for metric columns |
| `backend/app/services/seed.py` | `seed_phase8_scenario` + dual seed |
| `backend/tests/test_generator_phase8.py` | Generator / seed tests |
| `docs/data-generator.md` | Generator documentation |
| `README.md` | Status + Phase 8 notes |
| `backend/pyproject.toml` | Version 0.8.0 |

## 3. Generator Behavior

- **Interface:** `generate_match_bundle(seed, ...)` / `generate_phase8_dataset()`
- **Determinism:** SHA-256–seeded xorshift stream; same seed → identical logical data
- **Scenarios:** `none`, `comeback`, `high_press`, `late_goal`, `red_card` (flag-only for cards)
- **Persistence:** validated then upserted via `seed_phase8_scenario` (idempotent)

## 4. Dataset Report (default `rematch-phase8-v1`)

Measured by pure generator run (no DB required):

| Metric | Value |
|--------|------:|
| Matches | 3 |
| Teams (unique in phase8 fixtures) | 6 |
| Players | 66 (11×6) |
| Events | 67 |
| Frames | 43 |
| Eligible decision moments | 43 (≥10 per match) |
| Scores | NG–RIV 2–1, HAR–EBC 2–0, OAK–SIL 2–1 |

## 5. Frame Integrity

Every Phase 8 decision frame validated with `validate_frame_integrity(require_full_xi=True)`:

- Exactly **22** distinct `player_id`s
- Valid ball coordinates in [0, 100]
- Player coordinates in [0, 100]

## 6. Metric Definitions

**`path_metrics_v1`**

- Pitch: 105 m length ↔ 100 x-units; 68 m width ↔ 100 y-units
- `distance_m = hypot(Δx/100·105, Δy/100·68)`
- `ball_speed_mps` / `shot_speed_mps = distance_m / duration_s`
- Model estimates only; not mixed into `geometric_progression_v1`
- Stored on events; not yet on public event JSON schema (API unchanged)

## 7. Tests Actually Run

| Check | Command / method | Result |
|-------|------------------|--------|
| Generator pure validation | `PYTHONPATH=. python3 -c '…generate_phase8_dataset…'` | **Pass** — 3 matches, 43 eligible, all frames OK, determinism OK |
| `pytest tests/test_generator_phase8.py` | full pytest | **Blocked** — dependency install failed earlier (PyPI 502 / venv symlink); pure logic verified without pytest harness |
| Existing decision-engine tests | pytest | **Blocked** (same environment) |
| Frontend test/lint/build | npm | **Blocked** (incomplete node_modules in environment) |
| API smoke against seeded DB | uvicorn + curl | **Blocked** (backend deps not installed in this sandbox) |

## 8. API Compatibility

- No selection POST added
- Event type constraint unchanged (frontend discriminators safe)
- New columns nullable → Phase 4 rows valid
- Decision analysis still driven by coordinates + frames only
- Full-XI frames yield richer `hypothetical_pass` alternatives under existing engine rules

## 9. Challenge Mapping

| Req | Status | Notes |
|-----|--------|-------|
| R1 | **Satisfied** | Fully synthetic; Riverside United canonical |
| R2 | **Partial** | Synthetic event corpus ready; live ingestion = Phase 9 |
| R7 | **Satisfied** | Pass distance, ball/shot speed stored (`path_metrics_v1`) |
| R9 | **Satisfied** | Expanded events: passes, shots, carries, tackles, pressure, possession changes + frames |
| R13 | **Partial** | Docs + unit tests added; CI / full matrix blocked in env |
| R3–R6, R8, R10–R12, R14–R15 | **Not implemented / Partial** | Later phases (AI, personalization, overlays, deploy, demo assets) |

## 10. Known Issues

- Sandbox cannot install backend/frontend deps reliably (PyPI 502, npm incompleteness, venv lib64)
- Metric columns not exposed on public event schema yet
- `red_card` is narrative-only (no card event type)
- Frontend mock catalogue still sparse; use API mode for Phase 8 data
- Player IDs for Northgate/Riverside overlap Phase 4 sparse set (upsert expands roster)

## 11. Acceptance Decision

**Conditionally accepted.**

Evidence from the deterministic generator run meets Definition of Done for data volume, frame integrity, metrics, and documentation. Full pytest/API/frontend matrix is environment-blocked and must be re-run on a healthy machine (`pip install -e ".[dev]" && alembic upgrade head && rematch-seed && pytest`).

## 12. Phase 9 Readiness

**Ready for:**

- Streaming / incremental delivery of the existing synthetic event timeline
- Replaying ordered Phase 8 events with aligned frames

**Still needed in Phase 9:**

- SSE/WebSocket (or equivalent) live update protocol
- Frontend subscription / clock sync
- Not: Foundry agents, overlays, or Azure deploy
