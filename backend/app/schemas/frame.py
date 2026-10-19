from pydantic import BaseModel, ConfigDict

from app.schemas.common import DataProvenance, PitchPointSchema


class PlayerFrameSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    playerId: str
    teamId: str
    position: PitchPointSchema


class BallFrameSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    position: PitchPointSchema


class MatchFrameSchema(BaseModel):
    """Mirrors rematch-frontend MatchFrame (camelCase)."""

    model_config = ConfigDict(extra="forbid")

    id: str
    matchId: str
    eventId: str | None = None
    minute: int | None = None
    occurredAt: str | None = None
    players: list[PlayerFrameSchema]
    ball: BallFrameSchema | None = None
    provenance: DataProvenance


class MatchFrameListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[MatchFrameSchema]
    total: int
    limit: int
    offset: int
