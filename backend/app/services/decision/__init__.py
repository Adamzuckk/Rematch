"""Deterministic decision-analysis engine (Phase 5).

All scores are computed in Python from available event/frame geometry.
No probabilities, xG, or invented tracking are produced.
"""

from app.services.decision.engine import (
    DecisionEngineError,
    EventNotFoundError,
    InsufficientEvidenceError,
    MatchNotFoundError,
    analyze_decision,
    get_evidence_bundle,
)
from app.services.decision.evidence import verify_claim, verify_claims
from app.services.decision.serialize import analysis_to_schema, evidence_to_schema

__all__ = [
    "DecisionEngineError",
    "EventNotFoundError",
    "InsufficientEvidenceError",
    "MatchNotFoundError",
    "analyze_decision",
    "get_evidence_bundle",
    "verify_claim",
    "verify_claims",
    "analysis_to_schema",
    "evidence_to_schema",
]
