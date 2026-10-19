"""Map ORM rows to frontend-compatible camelCase API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models.event import MatchEvent
from app.models.frame import MatchFrame
from app.models.match import Match
from app.models.player import Player
from app.models.team import Team
from app.schemas.common import MatchScoreSchema, PitchPointSchema, PlayerSchema, TeamSchema
from app.schemas.event import (
    CarryEventSchema,
    MatchEventSchema,
    PassEventSchema,
    PossessionChangeEventSchema,
    PressureEventSchema,
    ShotEventSchema,
    TackleEventSchema,
)
from app.schemas.frame import BallFrameSchema, MatchFrameSchema, PlayerFrameSchema
from app.schemas.match import MatchSummarySchema


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.isoformat() + "Z"
    return value.isoformat().replace("+00:00", "Z")


def team_to_schema(team: Team) -> TeamSchema:
    return TeamSchema(id=team.id, name=team.name, shortName=team.short_name)


def player_to_schema(player: Player) -> PlayerSchema:
    return PlayerSchema(
        id=player.id,
        name=player.name,
        teamId=player.team_id,
        shirtNumber=player.shirt_number,
    )


def match_to_summary(match: Match) -> MatchSummarySchema:
    score = None
    if match.home_score is not None and match.away_score is not None:
        score = MatchScoreSchema(home=match.home_score, away=match.away_score)

    return MatchSummarySchema(
        id=match.id,
        competition=match.competition,
        homeTeam=team_to_schema(match.home_team),
        awayTeam=team_to_schema(match.away_team),
        status=match.status,  # type: ignore[arg-type]
        kickoffAt=_iso(match.kickoff_at) or "",
        score=score,
        minute=match.minute,
        venue=match.venue,
        provenance=match.provenance,  # type: ignore[arg-type]
        scenarioId=match.scenario_id,
    )


def _point(x: float | None, y: float | None) -> PitchPointSchema | None:
    if x is None or y is None:
        return None
    return PitchPointSchema(x=x, y=y)


def event_to_schema(event: MatchEvent) -> MatchEventSchema:
    base: dict[str, Any] = {
        "id": event.id,
        "matchId": event.match_id,
        "minute": event.minute,
        "occurredAt": _iso(event.occurred_at),
        "teamId": event.team_id,
        "playerId": event.player_id,
        "provenance": event.provenance,
    }

    if event.type == "pass":
        return PassEventSchema(
            **base,
            type="pass",
            start=_point(event.start_x, event.start_y),
            end=_point(event.end_x, event.end_y),
            receiverId=event.receiver_id,
            outcome=event.outcome,  # type: ignore[arg-type]
        )
    if event.type == "shot":
        return ShotEventSchema(
            **base,
            type="shot",
            location=_point(event.location_x, event.location_y),
            outcome=event.outcome,  # type: ignore[arg-type]
        )
    if event.type == "carry":
        return CarryEventSchema(
            **base,
            type="carry",
            start=_point(event.start_x, event.start_y),
            end=_point(event.end_x, event.end_y),
        )
    if event.type == "tackle":
        return TackleEventSchema(
            **base,
            type="tackle",
            location=_point(event.location_x, event.location_y),
            outcome=event.outcome,  # type: ignore[arg-type]
        )
    if event.type == "pressure":
        return PressureEventSchema(
            **base,
            type="pressure",
            location=_point(event.location_x, event.location_y),
        )
    if event.type == "possession_change":
        return PossessionChangeEventSchema(
            **base,
            type="possession_change",
            gainedByTeamId=event.gained_by_team_id,
        )
    raise ValueError(f"Unsupported event type: {event.type}")


def frame_to_schema(frame: MatchFrame) -> MatchFrameSchema:
    ball = None
    if frame.ball_x is not None and frame.ball_y is not None:
        ball = BallFrameSchema(position=PitchPointSchema(x=frame.ball_x, y=frame.ball_y))

    players = [
        PlayerFrameSchema(
            playerId=pos.player_id,
            teamId=pos.team_id,
            position=PitchPointSchema(x=pos.x, y=pos.y),
        )
        for pos in sorted(frame.players, key=lambda p: p.player_id)
    ]

    return MatchFrameSchema(
        id=frame.id,
        matchId=frame.match_id,
        eventId=frame.event_id,
        minute=frame.minute,
        occurredAt=_iso(frame.occurred_at),
        players=players,
        ball=ball,
        provenance=frame.provenance,  # type: ignore[arg-type]
    )
