"""Deterministic geometric decision-value scoring.

All scores are derived from PitchPoint geometry (0–100). No probabilities,
xG, or invented outcomes are produced.

Composite score for a path action (pass / carry / hypothetical pass):

    composite = progressive_distance(start, end) + goal_proximity_gain(start, end)

where both terms are in pitch-percentage units. Higher is more progressive
toward the opponent goal under the home/away attack direction convention.

Shots are scored as a virtual path from the shot location to the opponent
goal centre, using the same composite formula so ranking stays comparable.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.services.decision.geometry import (
    Point,
    distance,
    distance_to_goal,
    goal_proximity_gain,
    opponent_goal_center,
    progressive_distance,
)

MetricStatus = Literal["available", "unavailable"]
ActionKind = Literal["observed_pass", "observed_carry", "observed_shot", "hypothetical_pass"]


@dataclass(frozen=True)
class MetricValue:
    name: str
    status: MetricStatus
    value: float | None
    unit: str
    formula: str
    inputs: dict[str, float | str | bool]


@dataclass(frozen=True)
class ActionScore:
    """Score for one observed or hypothetical action."""

    action_id: str
    kind: ActionKind
    label: str
    start: Point | None
    end: Point | None
    target_player_id: str | None
    metrics: tuple[MetricValue, ...]
    composite_score: float | None
    rankable: bool
    limitations: tuple[str, ...]


SCORING_METHOD_ID = "geometric_progression_v1"
SCORING_METHOD_VERSION = "1.0.0"

COMPOSITE_FORMULA = (
    "progressive_distance(start, end, is_home) + "
    "goal_proximity_gain(start, end, is_home)"
)


def _metric(
    name: str,
    *,
    value: float | None,
    unit: str,
    formula: str,
    inputs: dict[str, float | str | bool],
) -> MetricValue:
    if value is None:
        return MetricValue(
            name=name,
            status="unavailable",
            value=None,
            unit=unit,
            formula=formula,
            inputs=inputs,
        )
    return MetricValue(
        name=name,
        status="available",
        value=value,
        unit=unit,
        formula=formula,
        inputs=inputs,
    )


def score_path_action(
    *,
    action_id: str,
    kind: ActionKind,
    label: str,
    start: Point,
    end: Point,
    is_home: bool,
    target_player_id: str | None = None,
) -> ActionScore:
    """Score a pass/carry (observed or hypothetical) with start→end geometry."""
    prog = progressive_distance(start, end, is_home=is_home)
    gain = goal_proximity_gain(start, end, is_home=is_home)
    path_len = distance(start, end)
    start_to_goal = distance_to_goal(start, is_home=is_home)
    end_to_goal = distance_to_goal(end, is_home=is_home)
    composite = prog + gain

    inputs_base: dict[str, float | str | bool] = {
        "start_x": start.x,
        "start_y": start.y,
        "end_x": end.x,
        "end_y": end.y,
        "is_home": is_home,
    }

    metrics = (
        _metric(
            "progressive_distance",
            value=prog,
            unit="pitch_percent",
            formula="attack_sign(is_home) * (end.x - start.x)",
            inputs=inputs_base,
        ),
        _metric(
            "goal_proximity_gain",
            value=gain,
            unit="pitch_percent",
            formula="distance_to_goal(start) - distance_to_goal(end)",
            inputs=inputs_base,
        ),
        _metric(
            "path_length",
            value=path_len,
            unit="pitch_percent",
            formula="hypot(end.x - start.x, end.y - start.y)",
            inputs=inputs_base,
        ),
        _metric(
            "start_distance_to_goal",
            value=start_to_goal,
            unit="pitch_percent",
            formula="distance(start, opponent_goal_center)",
            inputs=inputs_base,
        ),
        _metric(
            "end_distance_to_goal",
            value=end_to_goal,
            unit="pitch_percent",
            formula="distance(end, opponent_goal_center)",
            inputs=inputs_base,
        ),
        _metric(
            "composite_score",
            value=composite,
            unit="pitch_percent",
            formula=COMPOSITE_FORMULA,
            inputs=inputs_base,
        ),
    )

    return ActionScore(
        action_id=action_id,
        kind=kind,
        label=label,
        start=start,
        end=end,
        target_player_id=target_player_id,
        metrics=metrics,
        composite_score=composite,
        rankable=True,
        limitations=(),
    )


def score_shot_action(
    *,
    action_id: str,
    label: str,
    location: Point,
    is_home: bool,
) -> ActionScore:
    """Score a shot as a virtual path from location to the opponent goal centre."""
    goal = opponent_goal_center(is_home=is_home)
    scored = score_path_action(
        action_id=action_id,
        kind="observed_shot",
        label=label,
        start=location,
        end=goal,
        is_home=is_home,
    )
    # Re-label path end as goal centre and keep shot-specific limitation note.
    return ActionScore(
        action_id=scored.action_id,
        kind="observed_shot",
        label=scored.label,
        start=location,
        end=goal,
        target_player_id=None,
        metrics=scored.metrics,
        composite_score=scored.composite_score,
        rankable=True,
        limitations=(
            "Shot scored as virtual path from location to opponent goal centre; "
            "not an xG or probability estimate.",
        ),
    )


def unavailable_action(
    *,
    action_id: str,
    kind: ActionKind,
    label: str,
    reason: str,
    target_player_id: str | None = None,
) -> ActionScore:
    return ActionScore(
        action_id=action_id,
        kind=kind,
        label=label,
        start=None,
        end=None,
        target_player_id=target_player_id,
        metrics=(
            _metric(
                "composite_score",
                value=None,
                unit="pitch_percent",
                formula=COMPOSITE_FORMULA,
                inputs={},
            ),
        ),
        composite_score=None,
        rankable=False,
        limitations=(reason,),
    )


def rank_actions(actions: list[ActionScore]) -> list[tuple[int | None, ActionScore]]:
    """Return actions with 1-based ranks. Non-rankable actions get rank=None.

    Ranking: descending composite_score. Ties keep input order (stable).
    """
    rankable = [(i, a) for i, a in enumerate(actions) if a.rankable and a.composite_score is not None]
    rankable.sort(key=lambda pair: (-pair[1].composite_score, pair[0]))  # type: ignore[operator]

    rank_by_index: dict[int, int] = {}
    for rank, (idx, _) in enumerate(rankable, start=1):
        rank_by_index[idx] = rank

    return [(rank_by_index.get(i), action) for i, action in enumerate(actions)]


def nearest_opponent_distance(
    origin: Point,
    opponent_positions: list[Point],
) -> float | None:
    if not opponent_positions:
        return None
    return min(distance(origin, p) for p in opponent_positions)
