from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.common import (
    DataProvenance,
    MatchScoreSchema,
    MatchStatus,
    TeamSchema,
)


class MatchSummarySchema(BaseModel):
    """Mirrors rematch-frontend MatchSummary (camelCase)."""

    model_config = ConfigDict(extra="forbid")

    id: str
    competition: str
    homeTeam: TeamSchema
    awayTeam: TeamSchema
    status: MatchStatus
    kickoffAt: str
    score: MatchScoreSchema | None = None
    minute: int | None = None
    venue: str | None = None
    provenance: DataProvenance
    scenarioId: str
    homeFormation: str | None = None
    awayFormation: str | None = None
    liveRealDurationSeconds: int | None = None
    canStart: bool | None = None


class MatchListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[MatchSummarySchema]
    total: int
    limit: int
    offset: int


class MatchDatasetInfoSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenarioId: str
    provenance: DataProvenance
    description: str
    matchCount: int
    limitations: list[str]


class DashboardOverviewStatSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    value: str
    hint: str
    isDemoValue: Literal[True] = True
