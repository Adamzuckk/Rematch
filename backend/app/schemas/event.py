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
    detail: str | None = None


class ShotEventSchema(MatchEventBaseSchema):
    type: Literal["shot"]
    location: PitchPointSchema | None = None
    outcome: Literal["goal", "saved", "blocked", "off_target", "unknown"] | None = None
    assistPlayerId: str | None = None
    goalType: Literal["open_play", "penalty", "free_kick", "own_goal"] | None = None
    detail: str | None = None


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
    detail: str | None = None


class PossessionChangeEventSchema(MatchEventBaseSchema):
    type: Literal["possession_change"]
    gainedByTeamId: str | None = None


class FoulEventSchema(MatchEventBaseSchema):
    type: Literal["foul"]
    location: PitchPointSchema | None = None
    relatedPlayerId: str | None = None
    outcome: Literal["conceded", "won", "unknown"] | None = None
    detail: str | None = None


class YellowCardEventSchema(MatchEventBaseSchema):
    type: Literal["yellow_card"]
    location: PitchPointSchema | None = None
    detail: str | None = None


class RedCardEventSchema(MatchEventBaseSchema):
    type: Literal["red_card"]
    location: PitchPointSchema | None = None
    detail: str | None = None


class SubstitutionEventSchema(MatchEventBaseSchema):
    type: Literal["substitution"]
    location: PitchPointSchema | None = None
    relatedPlayerId: str | None = None
    detail: str | None = None


class OffsideEventSchema(MatchEventBaseSchema):
    type: Literal["offside"]
    location: PitchPointSchema | None = None
    outcome: Literal["flagged", "unknown"] | None = None


class CounterattackEventSchema(MatchEventBaseSchema):
    type: Literal["counterattack"]
    start: PitchPointSchema | None = None
    end: PitchPointSchema | None = None
    detail: str | None = None


class ReverseAttackEventSchema(MatchEventBaseSchema):
    type: Literal["reverse_attack"]
    start: PitchPointSchema | None = None
    end: PitchPointSchema | None = None
    detail: str | None = None


class CounterPressEventSchema(MatchEventBaseSchema):
    type: Literal["counter_press"]
    location: PitchPointSchema | None = None
    detail: str | None = None


MatchEventSchema = Annotated[
    Union[
        PassEventSchema,
        ShotEventSchema,
        CarryEventSchema,
        TackleEventSchema,
        PressureEventSchema,
        PossessionChangeEventSchema,
        FoulEventSchema,
        YellowCardEventSchema,
        RedCardEventSchema,
        SubstitutionEventSchema,
        OffsideEventSchema,
        CounterattackEventSchema,
        ReverseAttackEventSchema,
        CounterPressEventSchema,
    ],
    Field(discriminator="type"),
]


class MatchEventListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[MatchEventSchema]
    total: int
    limit: int
    offset: int
