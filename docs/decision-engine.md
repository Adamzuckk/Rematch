# Decision analysis engine (Phase 5)

Deterministic, on-demand evaluation of pass / shot / carry events from available
coordinates and aligned frames. **No LLM, xG, or invented tracking.**

Implementation lives under `backend/app/services/decision/`. API handlers only
load data and serialize results.

## Scoring method: `geometric_progression_v1`

| Field | Value |
|-------|-------|
| Method id | `geometric_progression_v1` |
| Version | `1.0.0` |
| Units | Pitch-percent (same 0–100 `PitchPoint` space as events/frames) |

### Composite score

For any path with start → end:

```text
progressive_distance = attack_sign(is_home) * (end.x - start.x)
goal_proximity_gain  = distance_to_goal(start) - distance_to_goal(end)
composite_score      = progressive_distance + goal_proximity_gain
```

Assumptions:

1. Home attacks toward `x=100`; away toward `x=0`.
2. Opponent goal centre is `(100, 50)` (home) or `(0, 50)` (away).
3. Higher composite means more geometric progression toward the opponent goal.
4. Recorded outcomes (`complete`, `goal`, …) are **context only** — they are not mixed into the score.
5. This is **not** a probability, expected-goals model, or proof that an action was “correct” in play.

### Shots

A shot is scored as a **virtual path** from `location` to the opponent goal centre, using the same composite formula. The response limitation note states explicitly that this is not xG.

### Alternatives

Hypothetical passes are built **only** when an aligned `MatchFrame` (`event_id` = decision event) contains teammate positions:

- Origin = event start (pass/carry) or shot location.
- End = teammate `(x, y)` from the frame.
- The acting player is excluded; for passes the actual receiver is excluded (they are the observed action).
- No passing-lane clearance, pressure cones, or unmarked-player inference is invented.

If no frame or no other teammates are present, `alternatives` is empty and ranking cannot compare options.

### Ranking

Actions with an available `composite_score` are ranked descending (ties keep input order). Non-rankable actions receive `rank: null`. Ranking is reported with the method id so clients can label it as a geometric heuristic.

### Metrics required inputs

| Metric | Required inputs | Unavailable when |
|--------|-----------------|------------------|
| `progressive_distance` | start, end, `is_home` | Missing coordinates |
| `goal_proximity_gain` | start, end, `is_home` | Missing coordinates |
| `path_length` | start, end | Missing coordinates |
| `start_distance_to_goal` / `end_distance_to_goal` | point, `is_home` | Missing coordinates |
| `composite_score` | both path terms | Missing coordinates |
| `nearest_opponent_distance` (context) | origin + opponent frame markers | No aligned frame or no opponents in frame |

Unsupported football metrics (not computed): xG, possession %, pass-completion probability, expected threat (xT), packing, unmarked status, full-XI pressure maps.

## Evidence verification

Module: `backend/app/services/decision/evidence.py`.

Each claim has:

| Field | Meaning |
|-------|---------|
| `status` | `verified` \| `partially_supported` \| `unsupported` |
| `evidence[]` | References (`event`, `frame`, `calculation`, `player_position`) with `matchId` |
| `reason` | Why the status was assigned |
| `limitations` | Honest gaps |
| `calculation` | Optional payload that must match a registered engine calculation |

Verification rules:

1. Every reference must belong to the analysis match and exist in the catalog.
2. Calculation values must match the engine’s registered result when supplied.
3. Empty evidence → `unsupported`.
4. Mix of valid and invalid refs → `partially_supported`.
5. `require_full_support` (internal) → `partially_supported` even when refs are valid (used for “all teammates evaluated” on sparse frames).
6. Plausible wording alone never verifies a claim.

## Completeness and confidence

| Completeness `level` | Meaning |
|----------------------|---------|
| `complete` | Coordinates present, aligned frame present, ≥1 scored alternative |
| `partial` | Observed action scorable, but frame and/or alternatives missing |
| `insufficient` | Cannot score observed action (API returns 422 instead of a body) |

| Confidence | Typical case |
|------------|--------------|
| `high` | Complete geometric comparison |
| `medium` | Coords + frame, but no alternatives |
| `low` | Coords only (no aligned frame) |
| `none` | Not returned as a successful analysis |

## Synthetic dataset limitations (`rematch-phase4-v1`)

- Fictional clubs and events only — not Premier League records.
- Frames exist only for three Northgate–Riverside moments (`frm-ng-12`, `frm-ng-23`, `frm-ng-64`), each with three player markers.
- `evt-ng-pass-12` has a frame but **no** teammate alternative (only the actual receiver besides the passer).
- `evt-ng-carry-64` has a useful alternative (pass to `player-northgate-9`) and is the primary demo comparison.
- Oakwood events have coordinates but **no** frames → observed score only.
- `pressure`, `tackle`, and `possession_change` are not decision candidates → `422 insufficient_evidence`.

## Worked example: `evt-ng-carry-64`

Match `m-northgate-riverside-2401`, Northgate home.

| Action | Start | End | Composite (approx.) | Rank |
|--------|-------|-----|---------------------|------|
| Observed carry | (35, 30) | (52, 44) | ≈ 36.63 | 2 |
| Hypothetical pass to `player-northgate-9` | (35, 30) | (68, 55) from `frm-ng-64` | ≈ 68.62 | 1 |

Interpretation allowed by the method: under `geometric_progression_v1`, the frame-backed pass endpoint progresses further toward goal than the carry end. Interpretation **not** allowed: “the pass was objectively the correct football decision” or any probability claim.

## Example API calls

```bash
# Decision analysis
curl -s "http://localhost:8000/api/v1/matches/m-northgate-riverside-2401/events/evt-ng-carry-64/decision-analysis" | jq .

# Evidence bundle
curl -s "http://localhost:8000/api/v1/matches/m-northgate-riverside-2401/events/evt-ng-carry-64/decision-analysis/evidence" | jq .

# Verify caller-supplied claims
curl -s -X POST "http://localhost:8000/api/v1/matches/m-northgate-riverside-2401/events/evt-ng-carry-64/decision-analysis/verify" \
  -H "Content-Type: application/json" \
  -d '{"claims":[{"id":"c1","statement":"test","status":"unsupported","evidence":[{"kind":"event","id":"evt-ng-carry-64","matchId":"m-northgate-riverside-2401"}],"reason":"","limitations":[]}]}'
```

See [api-contract.md](./api-contract.md) for response field definitions and error codes.
