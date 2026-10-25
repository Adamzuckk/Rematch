"""Typed input and output contract for the deterministic bilingual Narrator."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import DataProvenance
from app.schemas.decision import (
    ClaimVerificationResponseSchema,
    DecisionAnalysisSchema,
)
from app.schemas.event import MatchEventSchema
from app.schemas.match import MatchSummarySchema


class MatchIntelligenceTruthPack(BaseModel):
    """Facts supplied by Agent 1 and verifier; no match facts are fetched here."""

    model_config = ConfigDict(extra="forbid")

    match: MatchSummarySchema | None = None
    event: MatchEventSchema | None = None
    decisionAnalysis: DecisionAnalysisSchema | None = None
    verificationResults: list[ClaimVerificationResponseSchema] = Field(default_factory=list)
    unresolvedDetails: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def ensure_records_refer_to_same_event(self) -> "MatchIntelligenceTruthPack":
        if self.event is not None and self.match is not None:
            if self.event.matchId != self.match.id:
                raise ValueError("truth-pack event does not belong to its match")
        if self.decisionAnalysis is not None:
            if self.match is not None and self.decisionAnalysis.matchId != self.match.id:
                raise ValueError("truth-pack analysis does not belong to its match")
            if self.event is not None and self.decisionAnalysis.eventId != self.event.id:
                raise ValueError("truth-pack analysis does not belong to its event")
        if any(
            result.status != result.evidenceValidationStatus
            or result.claimSupportStatus != "not_assessed"
            for result in self.verificationResults
        ):
            raise ValueError("truth-pack verifier result has inconsistent status semantics")
        return self


class LocalizedNarrative(BaseModel):
    model_config = ConfigDict(extra="forbid")

    headline: str
    keyObservations: list[str]
    limitations: list[str]
    # Progressive-disclosure sections (optional; empty when not composed).
    whatHappened: list[str] = Field(default_factory=list)
    whyItMattered: list[str] = Field(default_factory=list)
    whatCouldHaveHappened: list[str] = Field(default_factory=list)
    analysisMethod: str = "deterministic_evidence_templates_v2"


class NarratorOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    matchId: str | None
    eventId: str | None
    provenance: DataProvenance | None
    english: LocalizedNarrative
    arabic: LocalizedNarrative
