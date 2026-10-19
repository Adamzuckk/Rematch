"""Pitch coordinate helpers aligned with the frontend PitchPoint convention.

Frontend (`rematch-frontend/src/types/coordinates.ts`):
- Units: normalized percentage of the pitch, range 0–100 inclusive.
- x: along pitch length (0 = left end-line, 100 = right end-line).
- y: along pitch width (0 = bottom touchline, 100 = top touchline).
- Origin: bottom-left of the pitch diagram.

Backend stores the same values as FLOAT columns. No unit conversion is applied
when serializing to the API — responses use the identical 0–100 space the SVG
pitch maps via `mapPitchPointToSvg`.
"""

from __future__ import annotations


class InvalidPitchCoordinateError(ValueError):
    """Raised when a coordinate is non-finite or outside 0–100."""


def is_valid_pitch_value(value: float | None) -> bool:
    if value is None:
        return True
    return isinstance(value, (int, float)) and value == value and 0.0 <= float(value) <= 100.0


def validate_pitch_point(x: float | None, y: float | None, *, label: str = "point") -> None:
    """Validate an optional (x, y) pair. Both must be present or both absent."""
    if x is None and y is None:
        return
    if x is None or y is None:
        raise InvalidPitchCoordinateError(
            f"{label}: both x and y are required when either is set",
        )
    if not is_valid_pitch_value(x) or not is_valid_pitch_value(y):
        raise InvalidPitchCoordinateError(
            f"{label}: coordinates must be finite numbers in [0, 100] (got x={x}, y={y})",
        )


def require_valid_pitch_point(x: float, y: float, *, label: str = "point") -> tuple[float, float]:
    validate_pitch_point(x, y, label=label)
    return float(x), float(y)
