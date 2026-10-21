"""Compose existing Match Intelligence, Verifier, and Narrator services."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy.orm import Session

from app.schemas.decision import ClaimVerificationResponseSchema, EvidenceReferenceSchema
from app.schemas.match_intelligence import MatchIntelligenceNarrativeResponseSchema
from app.schemas.narrator import MatchIntelligenceTruthPack, NarratorOutput
from app.schemas.verifier import (
    NarrativeClaimInput,
    NarrativeClaimVerificationResult,
)
from app.services import matches as match_service
from app.services.decision import (
    EventNotFoundError,
    MatchNotFoundError,
    analyze_decision,
    analysis_to_schema,
)
from app.services.decision.evidence import Claim
from app.services.narrator import narrate_truth_pack
from app.services.verifier import verify_narrative_claims


def _claim_inputs(claims: Sequence[Claim]) -> list[NarrativeClaimInput]:
    return [
        NarrativeClaimInput(
            id=claim.id,
            statement=claim.statement,
            evidence=[
                EvidenceReferenceSchema(
                    kind=reference.kind,
                    id=reference.id,
                    matchId=reference.match_id,
                    detail=reference.detail,
                )
                for reference in claim.evidence
            ],
            calculation=claim.calculation,
            limitations=list(claim.limitations),
            requireFullSupport=claim.require_full_support,
        )
        for claim in claims
    ]


def _narrator_verification_adapter(
    source_claims: Sequence[Claim],
    results: Sequence[NarrativeClaimVerificationResult],
) -> list[ClaimVerificationResponseSchema]:
    """Adapt Agent 3 results to Agent 2's existing verifier-input contract."""
    adapted: list[ClaimVerificationResponseSchema] = []
    for source, result in zip(source_claims, results, strict=True):
        adapted.append(
            ClaimVerificationResponseSchema(
                id=result.claimId,
                statement=result.submittedStatement,
                status=result.evidenceValidationStatus,
                evidenceValidationStatus=result.evidenceValidationStatus,
                claimSupportStatus=result.claimSupportStatus,
                validationMethod=result.validationMethod,
                validationScope=result.validationScope,
                evidence=result.evidence,
                reason=result.reason,
                limitations=list(result.limitations),
                calculation=source.calculation,
            )
        )
    return adapted


def build_match_intelligence_narrative(
    db: Session, match_id: str, event_id: str
) -> MatchIntelligenceNarrativeResponseSchema:
    """Run the three local components against one analysis and its catalog."""
    result = analyze_decision(db, match_id, event_id)

    try:
        match = match_service.get_match(db, match_id)
    except match_service.MatchNotFoundError as exc:
        # Reuse the decision route's existing not-found translation.
        raise MatchNotFoundError(exc.match_id) from None
    event = match_service.get_event(db, match_id, event_id)
    if event is None:
        raise EventNotFoundError(match_id, event_id)

    analysis = analysis_to_schema(result)
    claim_inputs = _claim_inputs(result.claims)
    verification_results = verify_narrative_claims(
        claim_inputs, result.evidence_catalog
    )
    narrator_pack = MatchIntelligenceTruthPack(
        match=match,
        event=event,
        decisionAnalysis=analysis,
        verificationResults=_narrator_verification_adapter(
            result.claims, verification_results
        ),
    )
    narrative: NarratorOutput = narrate_truth_pack(narrator_pack)

    return MatchIntelligenceNarrativeResponseSchema(
        matchId=match_id,
        eventId=event_id,
        provenance=match.provenance,
        analysis=analysis,
        verificationResults=verification_results,
        narrative=narrative,
    )
