# Synthetic match generator (Phase 8)

**Generator id:** `rematch-phase8-generator`  
**Generator version:** `1.0.0`  
**Scenario id:** `rematch-phase8-v1`  
**Provenance:** always `synthetic`

This document describes the deterministic generator that expands the ReMatch seed with full XI rosters, ordered match events, and **22-player decision frames**. It does not use real match data, real player names, or third-party trademarks.

## Architecture

```
app/simulation/generator/
  rng.py              Seeded PRNG (no global random / no clock)
  formations.py       4-3-3 and 4-2-3-1 slot templates
  metrics.py          path_metrics_v1 (distance, duration, speed)
  match_generator.py  MatchBundle + Phase8Dataset builders
  validate.py         Integrity checks before persistence
```

Persistence remains in `app/services/seed.py`:

1. `seed_phase4_scenario` — legacy sparse catalogue (backward compatible).
2. `seed_phase8_scenario` — generates Phase 8 data, validates each bundle, upserts.

Generation is **separated** from API routes and from the decision engine. The engine still scores only from event coordinates + aligned frames via `geometric_progression_v1`.

## Reproducibility

```python
from app.simulation.generator import generate_match_bundle, generate_phase8_dataset

bundle_a = generate_match_bundle("my-seed", match_id="m-1", ...)
bundle_b = generate_match_bundle("my-seed", match_id="m-1", ...)
# identical logical content
```

- Same `(generator_version, seed, match_id, parameters)` → identical IDs, coordinates, scores progression, and frames.
- Different seeds produce different geometries and event timings.
- No wall-clock timestamps are used inside the PRNG; `occurred_at` is `kickoff + minute`.

## Scenario controls

| Flag | Effect |
|------|--------|
| `none` | Balanced finished match |
| `comeback` | Away scores first; home recovers |
| `high_press` | Home-biased possession of decision moments; low away score |
| `late_goal` | Final goal forced near 88'+ for home |
| `red_card` | Narrative flag only — marks a late tackle as context (no new event type; schema still limited to existing types) |

Invalid combinations are not forced: the generator always keeps score consistent with `shot` events whose `outcome == goal`.

## Dataset contents (`rematch-phase8-v1`)

Three finished fictional matches (default seeds):

| Match id | Fixture | Scenario |
|----------|---------|----------|
| `m-p8-northgate-riverside-001` | Northgate FC vs **Riverside United** | comeback |
| `m-p8-harbor-eastbridge-002` | Harbor Athletic vs Eastbridge City | high_press |
| `m-p8-oakwood-silvermere-003` | Oakwood Wanderers vs Silvermere FC | late_goal |

Each match includes:

- 11 home + 11 away players (full XI, fictional names).
- ≥ 10 **eligible decision moments** (pass / shot / carry with coordinates **and** an aligned 22-player frame).
- Supporting pressure, tackle, and possession_change events.
- Consistent scoreboard vs goal events.

Canonical club name: **Riverside United** (not “Riverside Athletic”).

## Eligible decision moments

An event is eligible for decision analysis only when:

1. `type ∈ {pass, shot, carry}`
2. Required coordinates exist (start/end for pass & carry; location for shot)
3. An aligned `MatchFrame` exists with `event_id` set
4. That frame contains **22 distinct** player positions and a valid ball position
5. At least one teammate marker remains after excluding the actor (and actual receiver for passes) so alternatives can be built by the existing engine

The generator does **not** invent alternatives at analysis time — that remains the job of `analyze_decision`.

## Frame integrity

Every Phase 8 decision frame stores:

- `ball_x`, `ball_y` in pitch-percent [0, 100]
- Exactly 22 `PlayerFramePosition` rows (unique `player_id` per frame)
- References only to players that belong to the two match teams

Validation (`validate_frame_integrity` / `validate_match_bundle`) rejects incomplete frames before seeding.

## Metric formulas (`path_metrics_v1`)

Model estimates only — **not** optical tracking or broadcast measurements.

| Symbol | Formula / assumption |
|--------|----------------------|
| Pitch length | 105 m ↔ 100 x-units |
| Pitch width | 68 m ↔ 100 y-units |
| `distance_m` | `hypot((Δx/100)*105, (Δy/100)*68)` |
| `duration_s` | Generator-chosen positive duration for the path |
| `ball_speed_mps` | `distance_m / duration_s` for passes and carries |
| `shot_speed_mps` | Same formula along location → opponent goal centre for shots |

Stored on `match_events` as nullable columns (`distance_m`, `duration_s`, `ball_speed_mps`, `shot_speed_mps`). They are **not** mixed into `geometric_progression_v1` and are not currently exposed on the public event JSON schema (API remains backward compatible).

## Event types

Phase 8 stays within the existing schema constraint:

`pass | shot | carry | tackle | pressure | possession_change`

No foul/card/interception types were added, to avoid breaking frontend discriminators and Alembic check constraints unnecessarily. Disciplinary narrative for `red_card` is flag-only.

## How to regenerate / seed

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head          # includes 20261020_0002 metric columns
rematch-seed                 # seeds phase4 + phase8; Phase 8 is the preferred API dataset
```

Verify:

```bash
pytest tests/test_generator_phase8.py tests/test_decision_engine.py tests/test_decision_api.py -q
# Optional API smoke with uvicorn running:
# GET /api/v1/matches
# GET /api/v1/matches/m-p8-northgate-riverside-001/events/{eventId}/decision-analysis
```

## Compatibility with Decision Explorer / Pick Your Pass

- No selection POST endpoint was added.
- Phase 8 matches appear in `GET /api/v1/matches` like any other seed row.
- Aligned full-XI frames yield multiple `hypothetical_pass` alternatives from the existing engine.
- Sparse Phase 4 frames remain available for regression tests.

## Assumptions and limitations

- Synthetic, football-*inspired* geometry — not a physics simulation of real matches.
- Formations are static templates with light noise; no true tactical AI.
- Pass “accuracy” is a random complete/incomplete outcome, **not** inferred from distance.
- Speeds are model estimates under the documented pitch scaling.
- `red_card` does not add a card event type.
- Frontend mock catalogue is unchanged (still sparse); use API mode for Phase 8 richness.
- Live replay / SSE streaming is outside this dataset integration scope and is not implemented here.

## Known gaps

- Metric columns are stored but not yet part of the public event schema union.
- Scenario flags are not persisted as first-class DB fields (encoded in generator seeds only).
- Only three canonical Phase 8 fixtures ship by default; more can be added via `generate_match_bundle`.
