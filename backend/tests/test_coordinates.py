import pytest

from app.simulation.coordinates import (
    InvalidPitchCoordinateError,
    is_valid_pitch_value,
    require_valid_pitch_point,
    validate_pitch_point,
)


def test_valid_pitch_values() -> None:
    assert is_valid_pitch_value(0)
    assert is_valid_pitch_value(100)
    assert is_valid_pitch_value(42.5)
    assert is_valid_pitch_value(None)
    assert not is_valid_pitch_value(-0.1)
    assert not is_valid_pitch_value(100.1)
    assert not is_valid_pitch_value(float("nan"))


def test_validate_and_require() -> None:
    validate_pitch_point(None, None)
    validate_pitch_point(10, 90)
    assert require_valid_pitch_point(1, 2) == (1.0, 2.0)
    with pytest.raises(InvalidPitchCoordinateError):
        require_valid_pitch_point(101, 0)
