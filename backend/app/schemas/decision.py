"""Pydantic schemas for decision analysis and evidence verification."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import DataProvenance, PitchPointSchema

MetricStatus = Literal["available", "unavailable"]
VerificationStatus = Literal["verified", "partially_supported", "unsupported"]
EvidenceRefKind = Literal["event", "frame", "calculation", "player_position"]
ConfidenceLevel = Literal["high", "medium", "low", "none"]
CompletenessLevel = Literal["complete", "partial", "insufficient"]
ActionKind = Literal[
    "observed_pass",
    "observed_carry",
    "observed_shot",
    "hypothetical_pass",
]


class MetricValueSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    status: MetricStatus
    value: float | None = None
    unit: str
    formula: str
    inputs: dict[str, Any] = Field(default_factory=dict)


class ActionScoreSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actionId: str
    kind: ActionKind
    label: str
    start: PitchPointSchema | None = None
    end: PitchPointSchema | None = None
    targetPlayerId: str | None = None
    metrics: list[MetricValueSchema]
    compositeScore: float | None = None
    rankable: bool
    limitations: list[str] = Field(default_factory=list)


class RankingEntrySchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rank: int | None = None
    actionId: str
    kind: ActionKind
    label: str
    compositeScore: float | None = None
    targetPlayerId: str | None = None
    rankable: bool


class EvidenceReferenceSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: EvidenceRefKind
    id: str
    matchId: str
    detail: str | None = None


class ClaimSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    statement: str
    status: VerificationStatus
    evidence: list[EvidenceReferenceSchema] = Field(default_factory=list)
    reason: str
    limitations: list[str] = Field(default_factory=list)
    calculation: dict[str, Any] | None = None


class DataCompletenessSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    level: CompletenessLevel
    hasCoordinates: bool
    hasAlignedFrame: bool
    teammatePositionsInFrame: int
    opponentPositionsInFrame: int
    alternativeCount: int
    missing: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class DecisionAnalysisSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    matchId: str
    eventId: str
    eventType: str
    teamId: str | None = None
    playerId: str | None = None
    isHomeTeam: bool
    scoringMethodId: str
    scoringMethodVersion: str
    scoringAssumptions: list[str]
    observed: ActionScoreSchema
    alternatives: list[ActionScoreSchema]
    ranking: list[RankingEntrySchema]
    claims: list[ClaimSchema]
    completeness: DataCompletenessSchema
    confidence: ConfidenceLevel
    limitations: list[str]
    context: dict[str, Any]
    provenance: DataProvenance


class EvidenceBundleSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    matchId: str
    eventId: str
    scoringMethodId: str
    claims: list[ClaimSchema]
    calculationIds: list[str]
    frameIds: list[str]
    eventIds: list[str]
    limitations: list[str]
    provenance: DataProvenance


class ClaimVerificationRequest(BaseModel):
    """Optional body for validating caller-supplied claims against match evidence."""

    model_config = ConfigDict(extra="forbid")

    claims: list[ClaimSchema]
