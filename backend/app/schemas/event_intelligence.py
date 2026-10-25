"""Evidence-grounded per-event briefing for any match event type."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import DataProvenance
from app.schemas.decision import DecisionAnalysisSchema
from app.schemas.narrator import LocalizedNarrative


EvidenceTier = Literal["fact", "metric", "hypothesis", "missing"]


class EvidenceStatement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tier: EvidenceTier
    english: str
    arabic: str


class EventIntelligenceSchema(BaseModel):
    """Event briefing grounded in verified evidence.

    ``llmConnected`` is true only when an external provider successfully enriched
    the bilingual narrative from the verified evidence pack. Deterministic
    templates remain the reliable baseline and fallback.
    """

    model_config = ConfigDict(extra="forbid")

    matchId: str
    eventId: str
    eventType: str
    provenance: DataProvenance
    analysisMethod: str = "deterministic_event_intelligence_v1"
    llmConnected: bool = False
    decisionCandidate: bool
    english: LocalizedNarrative
    arabic: LocalizedNarrative
    statements: list[EvidenceStatement] = Field(default_factory=list)
    missingEvidence: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    decisionAnalysis: DecisionAnalysisSchema | None = None
