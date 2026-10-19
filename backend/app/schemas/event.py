from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import DataProvenance, PitchPointSchema


class MatchEventBaseSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    matchId: str
    minute: float | None = None
    occurredAt: str | None = None
    teamId: str | None = None
    playerId: str | None = None
    provenance: DataProvenance


class PassEventSchema(MatchEventBaseSchema):
    type: Literal["pass"]
    start: PitchPointSchema | None = None
    end: PitchPointSchema | None = None
    receiverId: str | None = None
    outcome: Literal["complete", "incomplete", "unknown"] | None = None


class ShotEventSchema(MatchEventBaseSchema):
    type: Literal["shot"]
    location: PitchPointSchema | None = None
    outcome: Literal["goal", "saved", "blocked", "off_target", "unknown"] | None = None


class CarryEventSchema(MatchEventBaseSchema):
    type: Literal["carry"]
    start: PitchPointSchema | None = None
    end: PitchPointSchema | None = None


class TackleEventSchema(MatchEventBaseSchema):
    type: Literal["tackle"]
    location: PitchPointSchema | None = None
    outcome: Literal["won", "lost", "unknown"] | None = None


class PressureEventSchema(MatchEventBaseSchema):
    type: Literal["pressure"]
    location: PitchPointSchema | None = None


class PossessionChangeEventSchema(MatchEventBaseSchema):
    type: Literal["possession_change"]
    gainedByTeamId: str | None = None


MatchEventSchema = Annotated[
    Union[
        PassEventSchema,
        ShotEventSchema,
        CarryEventSchema,
        TackleEventSchema,
        PressureEventSchema,
        PossessionChangeEventSchema,
    ],
    Field(discriminator="type"),
]


class MatchEventListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[MatchEventSchema]
    total: int
    limit: int
    offset: int
