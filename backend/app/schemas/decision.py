"""Pydantic schemas for decision analysis and evidence verification."""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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

# Bounds for caller-supplied verification payloads (also safe for engine output).
_MAX_ID_LEN = 128
_MAX_STATEMENT_LEN = 2_000
_MAX_REASON_LEN = 2_000
_MAX_DETAIL_LEN = 1_000
_MAX_LIMITATION_LEN = 500
_MAX_EVIDENCE_REFS = 32
_MAX_LIMITATIONS = 32
_MAX_VERIFY_CLAIMS = 32
_MAX_CALCULATION_JSON_BYTES = 8_192


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
    id: str = Field(max_length=_MAX_ID_LEN)
    matchId: str = Field(max_length=_MAX_ID_LEN)
    detail: str | None = Field(default=None, max_length=_MAX_DETAIL_LEN)


class ClaimSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(max_length=_MAX_ID_LEN)
    statement: str = Field(max_length=_MAX_STATEMENT_LEN)
    status: VerificationStatus
    evidence: list[EvidenceReferenceSchema] = Field(
        default_factory=list,
        max_length=_MAX_EVIDENCE_REFS,
    )
    reason: str = Field(max_length=_MAX_REASON_LEN)
    limitations: list[str] = Field(default_factory=list, max_length=_MAX_LIMITATIONS)
    calculation: dict[str, Any] | None = None

    @field_validator("limitations")
    @classmethod
    def _limit_limitation_strings(cls, value: list[str]) -> list[str]:
        for item in value:
            if len(item) > _MAX_LIMITATION_LEN:
                raise ValueError(
                    f"each limitation must be at most {_MAX_LIMITATION_LEN} characters"
                )
        return value

    @field_validator("calculation")
    @classmethod
    def _limit_calculation_payload(
        cls, value: dict[str, Any] | None
    ) -> dict[str, Any] | None:
        if value is None:
            return value
        encoded = json.dumps(value, default=str, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > _MAX_CALCULATION_JSON_BYTES:
            raise ValueError(
                f"calculation payload must be at most {_MAX_CALCULATION_JSON_BYTES} bytes"
            )
        return value


class ClaimVerificationResponseSchema(ClaimSchema):
    """Claim response with evidence-validation scope separated from truth support."""

    status: VerificationStatus = Field(
        description=(
            "Legacy alias for evidenceValidationStatus. It reflects evidence and "
            "calculation validation only, not natural-language claim truth."
        )
    )
    evidenceValidationStatus: VerificationStatus = Field(
        description="Result of validating evidence references and calculation consistency."
    )
    claimSupportStatus: Literal["not_assessed"] = Field(
        description="Natural-language statement truth is not assessed by this endpoint."
    )
    validationMethod: Literal["match_event_evidence_catalog_v1"] = Field(
        description="Identifier of the match/event evidence-catalog validation method."
    )
    validationScope: Literal[
        "evidence_reference_membership_and_registered_calculation_consistency"
    ] = Field(
        description=(
            "Checks reference membership and registered calculation consistency; "
            "does not assess arbitrary natural-language truth."
        )
    )


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

    claims: list[ClaimSchema] = Field(max_length=_MAX_VERIFY_CLAIMS)
