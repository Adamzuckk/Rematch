"""Synthetic path metrics for passes and shots (model estimates only).

Assumptions (documented, not real measurements):
- Pitch length maps 0–100 x → 105 metres.
- Pitch width maps 0–100 y → 68 metres.
- Distance uses planar Euclidean metric in that scaled space.
- Ball/shot speed = distance_m / duration_s when duration_s > 0.

Version: path_metrics_v1
"""

from __future__ import annotations

import math
from dataclasses import dataclass

PITCH_LENGTH_M = 105.0
PITCH_WIDTH_M = 68.0
METRICS_VERSION = "path_metrics_v1"


def pitch_distance_m(x0: float, y0: float, x1: float, y1: float) -> float:
    """Euclidean distance in metres under the documented pitch scaling."""
    dx_m = (x1 - x0) / 100.0 * PITCH_LENGTH_M
    dy_m = (y1 - y0) / 100.0 * PITCH_WIDTH_M
    return math.hypot(dx_m, dy_m)


@dataclass(frozen=True)
class PathMetrics:
    distance_m: float
    duration_s: float
    speed_mps: float
    version: str = METRICS_VERSION


def compute_path_metrics(
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    duration_s: float,
) -> PathMetrics:
    if duration_s <= 0:
        raise ValueError("duration_s must be positive")
    dist = pitch_distance_m(x0, y0, x1, y1)
    return PathMetrics(
        distance_m=round(dist, 3),
        duration_s=round(duration_s, 3),
        speed_mps=round(dist / duration_s, 3),
    )


def clamp_pitch(value: float) -> float:
    return max(0.0, min(100.0, value))
