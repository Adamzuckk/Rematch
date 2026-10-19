"""Decision analysis and evidence verification endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_dep
from app.schemas.common import ErrorResponse
from app.schemas.decision import (
    ClaimSchema,
    ClaimVerificationRequest,
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

router = APIRouter(prefix="/matches", tags=["decisions"])


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


@router.get(
    "/{match_id}/events/{event_id}/decision-analysis",
    response_model=DecisionAnalysisSchema,
    responses={
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def get_decision_analysis(
    match_id: str,
    event_id: str,
    db: Annotated[Session, Depends(get_db_dep)],
) -> DecisionAnalysisSchema:
    """Score the observed action and any frame-backed alternatives."""
    try:
        result = analyze_decision(db, match_id, event_id)
    except (MatchNotFoundError, EventNotFoundError, InsufficientEvidenceError) as exc:
        raise _http_for_engine(exc) from None
    return analysis_to_schema(result)


@router.get(
    "/{match_id}/events/{event_id}/decision-analysis/evidence",
    response_model=EvidenceBundleSchema,
    responses={
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def get_decision_evidence(
    match_id: str,
    event_id: str,
    db: Annotated[Session, Depends(get_db_dep)],
) -> EvidenceBundleSchema:
    """Return verified claims and registered evidence for an analysis."""
    try:
        result = analyze_decision(db, match_id, event_id)
    except (MatchNotFoundError, EventNotFoundError, InsufficientEvidenceError) as exc:
        raise _http_for_engine(exc) from None
    return evidence_to_schema(result)


@router.post(
    "/{match_id}/events/{event_id}/decision-analysis/verify",
    response_model=list[ClaimSchema],
    responses={
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def verify_decision_claims(
    match_id: str,
    event_id: str,
    body: ClaimVerificationRequest,
    db: Annotated[Session, Depends(get_db_dep)],
) -> list[ClaimSchema]:
    """Validate caller-supplied claims against the analysis evidence catalog."""
    try:
        result = analyze_decision(db, match_id, event_id)
    except (MatchNotFoundError, EventNotFoundError, InsufficientEvidenceError) as exc:
        raise _http_for_engine(exc) from None

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
        ClaimSchema(
            id=c.id,
            statement=c.statement,
            status=c.status,
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
            limitations=list(c.limitations),
            calculation=c.calculation,
        )
        for c in verified
    ]
