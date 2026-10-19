"""Map decision engine dataclasses to API schemas."""

from __future__ import annotations

from app.schemas.common import PitchPointSchema
from app.schemas.decision import (
    ActionScoreSchema,
    ClaimSchema,
    DataCompletenessSchema,
    DecisionAnalysisSchema,
    EvidenceBundleSchema,
    EvidenceReferenceSchema,
    MetricValueSchema,
    RankingEntrySchema,
)
from app.services.decision.engine import DecisionAnalysisResult
from app.services.decision.evidence import Claim
from app.services.decision.geometry import Point
from app.services.decision.scoring import ActionScore, MetricValue


def _point(p: Point | None) -> PitchPointSchema | None:
    if p is None:
        return None
    return PitchPointSchema(x=p.x, y=p.y)


def _metric(m: MetricValue) -> MetricValueSchema:
    return MetricValueSchema(
        name=m.name,
        status=m.status,
        value=m.value,
        unit=m.unit,
        formula=m.formula,
        inputs=dict(m.inputs),
    )


def _action(a: ActionScore) -> ActionScoreSchema:
    return ActionScoreSchema(
        actionId=a.action_id,
        kind=a.kind,
        label=a.label,
        start=_point(a.start),
        end=_point(a.end),
        targetPlayerId=a.target_player_id,
        metrics=[_metric(m) for m in a.metrics],
        compositeScore=a.composite_score,
        rankable=a.rankable,
        limitations=list(a.limitations),
    )


def _claim(c: Claim) -> ClaimSchema:
    return ClaimSchema(
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


def analysis_to_schema(result: DecisionAnalysisResult) -> DecisionAnalysisSchema:
    return DecisionAnalysisSchema(
        matchId=result.match_id,
        eventId=result.event_id,
        eventType=result.event_type,
        teamId=result.team_id,
        playerId=result.player_id,
        isHomeTeam=result.is_home_team,
        scoringMethodId=result.scoring_method_id,
        scoringMethodVersion=result.scoring_method_version,
        scoringAssumptions=list(result.scoring_assumptions),
        observed=_action(result.observed),
        alternatives=[_action(a) for a in result.alternatives],
        ranking=[
            RankingEntrySchema(
                rank=entry["rank"],
                actionId=entry["actionId"],
                kind=entry["kind"],
                label=entry["label"],
                compositeScore=entry["compositeScore"],
                targetPlayerId=entry["targetPlayerId"],
                rankable=entry["rankable"],
            )
            for entry in result.ranking
        ],
        claims=[_claim(c) for c in result.claims],
        completeness=DataCompletenessSchema(
            level=result.completeness.level,
            hasCoordinates=result.completeness.has_coordinates,
            hasAlignedFrame=result.completeness.has_aligned_frame,
            teammatePositionsInFrame=result.completeness.teammate_positions_in_frame,
            opponentPositionsInFrame=result.completeness.opponent_positions_in_frame,
            alternativeCount=result.completeness.alternative_count,
            missing=list(result.completeness.missing),
            notes=list(result.completeness.notes),
        ),
        confidence=result.confidence,
        limitations=list(result.limitations),
        context=dict(result.context),
        provenance=result.provenance,  # type: ignore[arg-type]
    )


def evidence_to_schema(result: DecisionAnalysisResult) -> EvidenceBundleSchema:
    catalog = result.evidence_catalog
    return EvidenceBundleSchema(
        matchId=result.match_id,
        eventId=result.event_id,
        scoringMethodId=result.scoring_method_id,
        claims=[_claim(c) for c in result.claims],
        calculationIds=sorted(catalog.calculation_ids),
        frameIds=sorted(catalog.frame_ids),
        eventIds=sorted(catalog.event_ids),
        limitations=list(result.limitations),
        provenance=result.provenance,  # type: ignore[arg-type]
    )
