"""Composed response for Match Intelligence, Verifier, and Narrator."""

from pydantic import BaseModel, ConfigDict

from app.schemas.common import DataProvenance
from app.schemas.decision import DecisionAnalysisSchema
from app.schemas.narrator import NarratorOutput
from app.schemas.verifier import NarrativeClaimVerificationResult


class MatchIntelligenceNarrativeResponseSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    matchId: str
    eventId: str
    provenance: DataProvenance
    analysis: DecisionAnalysisSchema
    verificationResults: list[NarrativeClaimVerificationResult]
    narrative: NarratorOutput
