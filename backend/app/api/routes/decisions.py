"""Decision analysis and evidence verification endpoints."""

from time import perf_counter
from typing import Annotated, Callable, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_dep
from app.schemas.common import ErrorResponse
from app.schemas.match_intelligence import MatchIntelligenceNarrativeResponseSchema
from app.schemas.event_intelligence import EventIntelligenceSchema
from app.schemas.decision import (
    ClaimVerificationRequest,
    ClaimVerificationResponseSchema,
    DecisionAnalysisSchema,
    EvidenceBundleSchema,
    EvidenceReferenceSchema,
)
from app.services.decision import (
    EventNotFoundError,
    InsufficientEvidenceError,
    MatchNotFoundError,
    analyze_decision,
    analysis_to_schema,
    evidence_to_schema,
)
from app.services.decision.evidence import Claim, EvidenceReference, verify_claims
from app.services.event_intelligence import build_event_intelligence
from app.services.match_intelligence import build_match_intelligence_narrative
from app.services.operational_metrics import MetricOperation, record_operation

router = APIRouter(prefix="/matches", tags=["decisions"])

MatchIdPath = Annotated[str, Path(min_length=1, max_length=128)]
EventIdPath = Annotated[str, Path(min_length=1, max_length=128)]
_ResponseT = TypeVar("_ResponseT")

CLAIM_VERIFICATION_LIMITATIONS = (
    "Validated evidence references and registered calculation values do not prove the submitted statement is true.",
    "geometric_progression_v1 is a geometric score, not xG or a pass-success probability.",
)


def _http_for_engine(exc: Exception) -> HTTPException:
    if isinstance(exc, MatchNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "match_not_found",
                "message": f"Match not found: {exc.match_id}",
            },
        )
    if isinstance(exc, EventNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "event_not_found",
                "message": f"Event not found: {exc.event_id} in match {exc.match_id}",
            },
        )
    if isinstance(exc, InsufficientEvidenceError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "insufficient_evidence",
                "message": exc.reason,
            },
        )
    raise exc


def _metric_failure_code(exc: Exception) -> str:
    if isinstance(exc, MatchNotFoundError):
        return "match_not_found"
    if isinstance(exc, EventNotFoundError):
        return "event_not_found"
    if isinstance(exc, InsufficientEvidenceError):
        return "insufficient_evidence"
    return "internal_error"


def _verification_statuses(value: object) -> list[str]:
    """Read verifier outcomes from a response without re-running verification."""
    candidates = getattr(value, "claims", None)
    if candidates is None:
        candidates = getattr(value, "verificationResults", None)
    if candidates is None and isinstance(value, list):
        candidates = value
    if not isinstance(candidates, list):
        return []
    statuses: list[str] = []
    for item in candidates:
        status = getattr(item, "status", None)
        if status is None:
            status = getattr(item, "evidenceValidationStatus", None)
        if isinstance(status, str):
            statuses.append(status)
    return statuses


def _recorded_operation(
    db: Session,
    *,
    operation: MetricOperation,
    execute: Callable[[], _ResponseT],
) -> _ResponseT:
    """Measure one real API operation, including known and unexpected failures."""
    started = perf_counter()
    try:
        response = execute()
    except Exception as exc:
        record_operation(
            db,
            operation=operation,
            outcome="failure",
            failure_code=_metric_failure_code(exc),
            latency_ms=round((perf_counter() - started) * 1000),
        )
        raise
    record_operation(
        db,
        operation=operation,
        outcome="success",
        latency_ms=round((perf_counter() - started) * 1000),
        verification_statuses=_verification_statuses(response),
    )
    return response


@router.get(
    "/{match_id}/events/{event_id}/decision-analysis",
    response_model=DecisionAnalysisSchema,
    responses={
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def get_decision_analysis(
    match_id: MatchIdPath,
    event_id: EventIdPath,
    db: Annotated[Session, Depends(get_db_dep)],
) -> DecisionAnalysisSchema:
    """Score the observed action and any frame-backed alternatives."""
    try:
        return _recorded_operation(
            db,
            operation="analysis",
            execute=lambda: analysis_to_schema(analyze_decision(db, match_id, event_id)),
        )
    except (MatchNotFoundError, EventNotFoundError, InsufficientEvidenceError) as exc:
        raise _http_for_engine(exc) from None


@router.get(
    "/{match_id}/events/{event_id}/decision-analysis/narrative",
    response_model=MatchIntelligenceNarrativeResponseSchema,
    responses={
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def get_decision_narrative(
    match_id: MatchIdPath,
    event_id: EventIdPath,
    db: Annotated[Session, Depends(get_db_dep)],
) -> MatchIntelligenceNarrativeResponseSchema:
    """Return one Agent 1 analysis with evidence validation and bilingual narration."""
    try:
        return _recorded_operation(
            db,
            operation="analysis",
            execute=lambda: build_match_intelligence_narrative(db, match_id, event_id),
        )
    except (MatchNotFoundError, EventNotFoundError, InsufficientEvidenceError) as exc:
        raise _http_for_engine(exc) from None


@router.get(
    "/{match_id}/events/{event_id}/event-intelligence",
    response_model=EventIntelligenceSchema,
    responses={
        404: {"model": ErrorResponse},
    },
)
def get_event_intelligence(
    match_id: MatchIdPath,
    event_id: EventIdPath,
    db: Annotated[Session, Depends(get_db_dep)],
) -> EventIntelligenceSchema:
    """Evidence-grounded briefing for any event type.

    Uses deterministic templates, optionally enriched by a server-side LLM when
    configured. Never invents statistics; ``llmConnected`` reflects a real
    successful provider call only.
    """
    try:
        return _recorded_operation(
            db,
            operation="analysis",
            execute=lambda: build_event_intelligence(db, match_id, event_id),
        )
    except (MatchNotFoundError, EventNotFoundError) as exc:
        raise _http_for_engine(exc) from None


@router.get(
    "/{match_id}/events/{event_id}/decision-analysis/evidence",
    response_model=EvidenceBundleSchema,
    responses={
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def get_decision_evidence(
    match_id: MatchIdPath,
    event_id: EventIdPath,
    db: Annotated[Session, Depends(get_db_dep)],
) -> EvidenceBundleSchema:
    """Return verified claims and registered evidence for an analysis."""
    try:
        return _recorded_operation(
            db,
            operation="analysis",
            execute=lambda: evidence_to_schema(analyze_decision(db, match_id, event_id)),
        )
    except (MatchNotFoundError, EventNotFoundError, InsufficientEvidenceError) as exc:
        raise _http_for_engine(exc) from None


@router.post(
    "/{match_id}/events/{event_id}/decision-analysis/verify",
    response_model=list[ClaimVerificationResponseSchema],
    responses={
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def verify_decision_claims(
    match_id: MatchIdPath,
    event_id: EventIdPath,
    body: ClaimVerificationRequest,
    db: Annotated[Session, Depends(get_db_dep)],
) -> list[ClaimVerificationResponseSchema]:
    """Validate evidence references and calculations, not natural-language truth."""
    def execute_verification() -> list[ClaimVerificationResponseSchema]:
        # The evidence catalog is built as part of this verification request.
        # It is measured as one verification operation rather than a second,
        # separate analysis request.
        result = analyze_decision(db, match_id, event_id)
        claims = [
            Claim(
                id=c.id,
                statement=c.statement,
                status=c.status,
                evidence=[
                    EvidenceReference(
                        kind=ref.kind,
                        id=ref.id,
                        match_id=ref.matchId,
                        detail=ref.detail,
                    )
                    for ref in c.evidence
                ],
                reason=c.reason,
                limitations=list(c.limitations),
                calculation=c.calculation,
            )
            for c in body.claims
        ]
        verified = verify_claims(claims, result.evidence_catalog)
        return [
            ClaimVerificationResponseSchema(
                id=c.id,
                statement=c.statement,
                status=c.status,
                evidenceValidationStatus=c.status,
                claimSupportStatus="not_assessed",
                validationMethod="match_event_evidence_catalog_v1",
                validationScope=(
                    "evidence_reference_membership_and_registered_calculation_consistency"
                ),
                evidence=[
                    EvidenceReferenceSchema(
                        kind=ref.kind,
                        id=ref.id,
                        matchId=ref.match_id,
                        detail=ref.detail,
                    )
                    for ref in c.evidence
                ],
                reason=c.reason,
                limitations=list(dict.fromkeys([*c.limitations, *CLAIM_VERIFICATION_LIMITATIONS])),
                calculation=c.calculation,
            )
            for c in verified
        ]

    try:
        return _recorded_operation(
            db, operation="verification", execute=execute_verification
        )
    except (MatchNotFoundError, EventNotFoundError, InsufficientEvidenceError) as exc:
        raise _http_for_engine(exc) from None
