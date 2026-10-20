"""Synthetic formation templates (pitch-percent, home attacking toward x=100)."""

from __future__ import annotations

from typing import TypedDict


class RoleSlot(TypedDict):
    role: str
    x: float  # relative to own half orientation; mirrored for away
    y: float


# 4-3-3 base slots for the home team (own goal near x=0).
FORMATION_433: list[RoleSlot] = [
    {"role": "GK", "x": 5.0, "y": 50.0},
    {"role": "RB", "x": 18.0, "y": 18.0},
    {"role": "CB", "x": 14.0, "y": 38.0},
    {"role": "CB", "x": 14.0, "y": 62.0},
    {"role": "LB", "x": 18.0, "y": 82.0},
    {"role": "CM", "x": 35.0, "y": 30.0},
    {"role": "CDM", "x": 32.0, "y": 50.0},
    {"role": "CM", "x": 35.0, "y": 70.0},
    {"role": "RW", "x": 55.0, "y": 20.0},
    {"role": "ST", "x": 62.0, "y": 50.0},
    {"role": "LW", "x": 55.0, "y": 80.0},
]

FORMATION_4231: list[RoleSlot] = [
    {"role": "GK", "x": 5.0, "y": 50.0},
    {"role": "RB", "x": 18.0, "y": 15.0},
    {"role": "CB", "x": 14.0, "y": 38.0},
    {"role": "CB", "x": 14.0, "y": 62.0},
    {"role": "LB", "x": 18.0, "y": 85.0},
    {"role": "CDM", "x": 30.0, "y": 40.0},
    {"role": "CDM", "x": 30.0, "y": 60.0},
    {"role": "RW", "x": 52.0, "y": 18.0},
    {"role": "CAM", "x": 48.0, "y": 50.0},
    {"role": "LW", "x": 52.0, "y": 82.0},
    {"role": "ST", "x": 65.0, "y": 50.0},
]


def away_mirror(slot: RoleSlot) -> RoleSlot:
    """Mirror home slots so away attacks toward x=0."""
    return {"role": slot["role"], "x": 100.0 - slot["x"], "y": slot["y"]}


def formation_slots(name: str) -> list[RoleSlot]:
    if name == "4-2-3-1":
        return list(FORMATION_4231)
    return list(FORMATION_433)
