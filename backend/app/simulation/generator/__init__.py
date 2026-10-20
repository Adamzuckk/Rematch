"""Deterministic synthetic match generator (Phase 8).

Public entry points:
- generate_match_bundle(seed, ...) -> MatchBundle
- generate_phase8_dataset() -> Phase8Dataset
- validate_match_bundle / validate_frame_integrity
"""

from app.simulation.generator.match_generator import (
    GENERATOR_VERSION,
    MatchBundle,
    Phase8Dataset,
    generate_match_bundle,
    generate_phase8_dataset,
)
from app.simulation.generator.metrics import (
    PITCH_LENGTH_M,
    PITCH_WIDTH_M,
    compute_path_metrics,
    pitch_distance_m,
)
from app.simulation.generator.validate import (
    ValidationReport,
    validate_frame_integrity,
    validate_match_bundle,
)

__all__ = [
    "GENERATOR_VERSION",
    "MatchBundle",
    "Phase8Dataset",
    "PITCH_LENGTH_M",
    "PITCH_WIDTH_M",
    "ValidationReport",
    "compute_path_metrics",
    "generate_match_bundle",
    "generate_phase8_dataset",
    "pitch_distance_m",
    "validate_frame_integrity",
    "validate_match_bundle",
]
