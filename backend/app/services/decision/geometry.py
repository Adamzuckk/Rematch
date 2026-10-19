"""Pure geometry helpers for PitchPoint (0–100) space."""

from __future__ import annotations

import math
from typing import NamedTuple


class Point(NamedTuple):
    x: float
    y: float


def distance(a: Point, b: Point) -> float:
    return math.hypot(b.x - a.x, b.y - a.y)


def attack_sign(*, is_home: bool) -> float:
    """Home attacks toward x=100 (+1); away toward x=0 (-1)."""
    return 1.0 if is_home else -1.0


def opponent_goal_center(*, is_home: bool) -> Point:
    return Point(100.0, 50.0) if is_home else Point(0.0, 50.0)


def progressive_distance(start: Point, end: Point, *, is_home: bool) -> float:
    """Attack-direction component of displacement (positive = toward opponent goal)."""
    return attack_sign(is_home=is_home) * (end.x - start.x)


def distance_to_goal(point: Point, *, is_home: bool) -> float:
    return distance(point, opponent_goal_center(is_home=is_home))


def goal_proximity_gain(start: Point, end: Point, *, is_home: bool) -> float:
    """Positive when the end point is closer to the opponent goal than the start."""
    return distance_to_goal(start, is_home=is_home) - distance_to_goal(end, is_home=is_home)
