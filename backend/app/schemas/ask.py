"""Request/response contract for Match Studio Ask the Crew."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import DataProvenance
from app.schemas.narrator import LocalizedNarrative
from app.schemas.verifier import NarrativeClaimVerificationResult

AskStatus = Literal["answered", "partial", "unsupported", "unavailable"]
AskIntent = Literal[
    "greeting",
    "help",
    "narrative",
    "verification",
    "local_facts",
    "whatif",
    "unsupported",
]
AskFactClass = Literal[
    "match_data",
    "calculated",
    "alternative_estimate",
    "unknown",
    "capability",
]
AskLanguage = Literal["en", "ar"]


class AskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=500)
    eventId: str | None = Field(default=None, max_length=128)
    language: AskLanguage = "en"
    clientRequestId: str | None = Field(default=None, max_length=128)

    @field_validator("question")
    @classmethod
    def strip_question(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("question must not be blank")
        return cleaned

    @field_validator("eventId", "clientRequestId")
    @classmethod
    def empty_optional_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class AskAnswerBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    english: LocalizedNarrative
    arabic: LocalizedNarrative


class AskEvidenceRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["event", "frame", "calculation", "player_position", "match"]
    id: str
    matchId: str
    detail: str | None = None


class AskResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    matchId: str
    eventId: str | None
    status: AskStatus
    intent: AskIntent
    provenance: DataProvenance
    answer: AskAnswerBody
    evidence: list[AskEvidenceRef] = Field(default_factory=list)
    relatedEventIds: list[str] = Field(default_factory=list)
    factClasses: list[AskFactClass] = Field(default_factory=list)
    reason: str | None = None
    verificationResults: list[NarrativeClaimVerificationResult] = Field(
        default_factory=list
    )
    clientRequestId: str | None = None
