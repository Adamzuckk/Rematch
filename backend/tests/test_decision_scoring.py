"""Controlled fixtures for deterministic geometric scoring."""

from __future__ import annotations

import math

from app.services.decision.geometry import (
    Point,
    distance_to_goal,
    goal_proximity_gain,
    progressive_distance,
)
from app.services.decision.scoring import (
    nearest_opponent_distance,
    rank_actions,
    score_path_action,
    score_shot_action,
)


def test_progressive_distance_home_away() -> None:
    start = Point(40.0, 50.0)
    end = Point(55.0, 50.0)
    assert progressive_distance(start, end, is_home=True) == 15.0
    assert progressive_distance(start, end, is_home=False) == -15.0


def test_goal_proximity_gain_deterministic() -> None:
    start = Point(42.0, 48.0)
    end = Point(58.0, 62.0)
    gain = goal_proximity_gain(start, end, is_home=True)
    expected = distance_to_goal(start, is_home=True) - distance_to_goal(end, is_home=True)
    assert gain == expected
    assert math.isclose(gain, 14.353_813_178_5, rel_tol=1e-9)


def test_pass_composite_matches_seeded_evt_ng_pass_12() -> None:
    """Worked example: Northgate pass evt-ng-pass-12 geometry."""
    start = Point(42.0, 48.0)
    end = Point(58.0, 62.0)
    scored = score_path_action(
        action_id="observed:evt-ng-pass-12",
        kind="observed_pass",
        label="Observed pass",
        start=start,
        end=end,
        is_home=True,
        target_player_id="player-northgate-11",
    )
    prog = 16.0
    gain = goal_proximity_gain(start, end, is_home=True)
    assert scored.composite_score is not None
    assert math.isclose(scored.composite_score, prog + gain, rel_tol=1e-12)
    assert math.isclose(scored.composite_score, 30.353_813_178_5, rel_tol=1e-9)
    assert scored.rankable is True


def test_carry_vs_alternative_pass_ranking() -> None:
    """Carry evt-ng-carry-64 vs hypothetical pass to ng9 from start."""
    carry_start = Point(35.0, 30.0)
    carry_end = Point(52.0, 44.0)
    ng9 = Point(68.0, 55.0)

    observed = score_path_action(
        action_id="observed:carry",
        kind="observed_carry",
        label="Observed carry",
        start=carry_start,
        end=carry_end,
        is_home=True,
    )
    alt = score_path_action(
        action_id="alt:ng9",
        kind="hypothetical_pass",
        label="Pass to ng9",
        start=carry_start,
        end=ng9,
        is_home=True,
        target_player_id="player-northgate-9",
    )

    assert observed.composite_score is not None
    assert alt.composite_score is not None
    # Pass to ng9 progresses further toward goal than the carry end.
    assert alt.composite_score > observed.composite_score

    ranked = rank_actions([observed, alt])
    assert ranked[0][0] == 2  # observed ranks second
    assert ranked[1][0] == 1  # alternative ranks first
    assert ranked[1][1].action_id == "alt:ng9"


def test_shot_score_virtual_path_to_goal() -> None:
    location = Point(88.0, 52.0)
    shot = score_shot_action(
        action_id="observed:shot",
        label="Observed shot",
        location=location,
        is_home=True,
    )
    assert shot.composite_score is not None
    # progressive 12 + proximity gain to goal (~12.1655)
    assert math.isclose(shot.composite_score, 24.165_525_060_6, rel_tol=1e-9)
    assert any("not an xG" in lim for lim in shot.limitations)


def test_ranking_non_rankable_gets_none() -> None:
    from app.services.decision.scoring import unavailable_action

    good = score_path_action(
        action_id="a",
        kind="observed_pass",
        label="a",
        start=Point(10, 50),
        end=Point(20, 50),
        is_home=True,
    )
    bad = unavailable_action(
        action_id="b",
        kind="observed_pass",
        label="b",
        reason="missing coords",
    )
    ranked = rank_actions([good, bad])
    assert ranked[0][0] == 1
    assert ranked[1][0] is None


def test_nearest_opponent_distance() -> None:
    origin = Point(42.0, 48.0)
    assert nearest_opponent_distance(origin, []) is None
    d = nearest_opponent_distance(origin, [Point(50.0, 45.0), Point(90.0, 50.0)])
    assert d is not None
    assert math.isclose(d, math.hypot(8.0, -3.0), rel_tol=1e-12)


def test_scoring_is_repeatable() -> None:
    start, end = Point(35.0, 30.0), Point(52.0, 44.0)
    a = score_path_action(
        action_id="x",
        kind="observed_carry",
        label="x",
        start=start,
        end=end,
        is_home=True,
    )
    b = score_path_action(
        action_id="x",
        kind="observed_carry",
        label="x",
        start=start,
        end=end,
        is_home=True,
    )
    assert a.composite_score == b.composite_score
    assert [m.value for m in a.metrics] == [m.value for m in b.metrics]
