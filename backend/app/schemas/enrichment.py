"""Additive schemas for coaches, form, player stats, and start-match."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import DataProvenance, PlayerSchema, TeamSchema
from app.schemas.match import MatchSummarySchema


class TeamFormResultSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    teamId: str
    playedAt: str
    opponentName: str
    isHome: bool
    goalsFor: int = Field(ge=0)
    goalsAgainst: int = Field(ge=0)
    result: Literal["W", "D", "L"]
    competition: str
    provenance: DataProvenance


class PlayerMatchStatsSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    playerId: str
    playerName: str
    teamId: str
    shirtNumber: int | None = None
    role: str | None = None
    goals: int = 0
    assists: int = 0
    shots: int = 0
    passes: int = 0
    tackles: int = 0
    fouls: int = 0
    yellowCards: int = 0
    redCards: int = 0
    offsides: int = 0


class MatchContextSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    match: MatchSummarySchema
    homeCoachName: str | None = None
    awayCoachName: str | None = None
    homeForm: list[TeamFormResultSchema]
    awayForm: list[TeamFormResultSchema]
    playerStats: list[PlayerMatchStatsSchema]
    homePlayers: list[PlayerSchema]
    awayPlayers: list[PlayerSchema]


class StartMatchResponseSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    match: MatchSummarySchema
    started: Literal[True] = True


class TeamDetailSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    team: TeamSchema
    form: list[TeamFormResultSchema]
