from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DataProvenance = Literal["synthetic", "api", "unavailable"]
MatchStatus = Literal["live", "finished", "upcoming"]


class PitchPointSchema(BaseModel):
    """Frontend-compatible PitchPoint (0–100%, origin bottom-left)."""

    model_config = ConfigDict(extra="forbid")

    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)


class TeamSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    shortName: str | None = None
    coachName: str | None = None


class PlayerSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    teamId: str
    shirtNumber: int | None = None
    role: str | None = None
    positionSlot: str | None = None


class MatchScoreSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    home: int = Field(ge=0)
    away: int = Field(ge=0)


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
