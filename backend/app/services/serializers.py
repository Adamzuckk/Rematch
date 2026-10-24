"""Map ORM rows to frontend-compatible camelCase API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models.event import MatchEvent
from app.models.frame import MatchFrame
from app.models.match import Match
from app.models.player import Player
from app.models.team import Team, TeamFormResult
from app.schemas.common import MatchScoreSchema, PitchPointSchema, PlayerSchema, TeamSchema
from app.schemas.enrichment import PlayerMatchStatsSchema, TeamFormResultSchema
from app.schemas.event import (
    CarryEventSchema,
    CounterattackEventSchema,
    CounterPressEventSchema,
    FoulEventSchema,
    MatchEventSchema,
    OffsideEventSchema,
    PassEventSchema,
    PossessionChangeEventSchema,
    PressureEventSchema,
    RedCardEventSchema,
    ReverseAttackEventSchema,
    ShotEventSchema,
    SubstitutionEventSchema,
    TackleEventSchema,
    YellowCardEventSchema,
)
from app.schemas.frame import BallFrameSchema, MatchFrameSchema, PlayerFrameSchema
from app.schemas.match import MatchSummarySchema
from app.services.live_clock import LIVE_REAL_DURATION_S


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.isoformat() + "Z"
    return value.isoformat().replace("+00:00", "Z")


def team_to_schema(team: Team) -> TeamSchema:
    return TeamSchema(
        id=team.id,
        name=team.name,
        shortName=team.short_name,
        coachName=team.coach_name,
    )


def player_to_schema(player: Player) -> PlayerSchema:
    return PlayerSchema(
        id=player.id,
        name=player.name,
        teamId=player.team_id,
        shirtNumber=player.shirt_number,
        role=player.role,
        positionSlot=player.position_slot,
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
        homeFormation=match.home_formation,
        awayFormation=match.away_formation,
        liveRealDurationSeconds=int(LIVE_REAL_DURATION_S)
        if match.status in {"live", "upcoming"}
        else None,
        canStart=match.status == "upcoming",
    )


def form_to_schema(row: TeamFormResult) -> TeamFormResultSchema:
    return TeamFormResultSchema(
        id=row.id,
        teamId=row.team_id,
        playedAt=_iso(row.played_at) or "",
        opponentName=row.opponent_name,
        isHome=row.is_home,
        goalsFor=row.goals_for,
        goalsAgainst=row.goals_against,
        result=row.result,  # type: ignore[arg-type]
        competition=row.competition,
        provenance=row.provenance,  # type: ignore[arg-type]
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
            detail=event.detail,
        )
    if event.type == "shot":
        return ShotEventSchema(
            **base,
            type="shot",
            location=_point(event.location_x, event.location_y),
            outcome=event.outcome,  # type: ignore[arg-type]
            assistPlayerId=event.assist_player_id,
            goalType=event.goal_type,  # type: ignore[arg-type]
            detail=event.detail,
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
            detail=event.detail,
        )
    if event.type == "possession_change":
        return PossessionChangeEventSchema(
            **base,
            type="possession_change",
            gainedByTeamId=event.gained_by_team_id,
        )
    if event.type == "foul":
        return FoulEventSchema(
            **base,
            type="foul",
            location=_point(event.location_x, event.location_y),
            relatedPlayerId=event.related_player_id,
            outcome=event.outcome,  # type: ignore[arg-type]
            detail=event.detail,
        )
    if event.type == "yellow_card":
        return YellowCardEventSchema(
            **base,
            type="yellow_card",
            location=_point(event.location_x, event.location_y),
            detail=event.detail,
        )
    if event.type == "red_card":
        return RedCardEventSchema(
            **base,
            type="red_card",
            location=_point(event.location_x, event.location_y),
            detail=event.detail,
        )
    if event.type == "substitution":
        return SubstitutionEventSchema(
            **base,
            type="substitution",
            location=_point(event.location_x, event.location_y),
            relatedPlayerId=event.related_player_id,
            detail=event.detail,
        )
    if event.type == "offside":
        return OffsideEventSchema(
            **base,
            type="offside",
            location=_point(event.location_x, event.location_y),
            outcome=event.outcome,  # type: ignore[arg-type]
        )
    if event.type == "counterattack":
        return CounterattackEventSchema(
            **base,
            type="counterattack",
            start=_point(event.start_x, event.start_y),
            end=_point(event.end_x, event.end_y),
            detail=event.detail,
        )
    if event.type == "reverse_attack":
        return ReverseAttackEventSchema(
            **base,
            type="reverse_attack",
            start=_point(event.start_x, event.start_y),
            end=_point(event.end_x, event.end_y),
            detail=event.detail,
        )
    if event.type == "counter_press":
        return CounterPressEventSchema(
            **base,
            type="counter_press",
            location=_point(event.location_x, event.location_y),
            detail=event.detail,
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


def compute_player_stats(
    events: list[MatchEvent],
    players: list[Player],
) -> list[PlayerMatchStatsSchema]:
    by_id = {p.id: p for p in players}
    stats: dict[str, PlayerMatchStatsSchema] = {}

    def ensure(player_id: str) -> PlayerMatchStatsSchema | None:
        player = by_id.get(player_id)
        if player is None:
            return None
        if player_id not in stats:
            stats[player_id] = PlayerMatchStatsSchema(
                playerId=player.id,
                playerName=player.name,
                teamId=player.team_id,
                shirtNumber=player.shirt_number,
                role=player.role,
            )
        return stats[player_id]

    for event in events:
        if event.player_id:
            row = ensure(event.player_id)
            if row is None:
                continue
            if event.type == "shot":
                row.shots += 1
                if event.outcome == "goal" and event.goal_type != "own_goal":
                    row.goals += 1
            elif event.type == "pass":
                row.passes += 1
            elif event.type == "tackle":
                row.tackles += 1
            elif event.type == "foul":
                row.fouls += 1
            elif event.type == "yellow_card":
                row.yellowCards += 1
            elif event.type == "red_card":
                row.redCards += 1
            elif event.type == "offside":
                row.offsides += 1
        if event.type == "shot" and event.assist_player_id and event.outcome == "goal":
            assist_row = ensure(event.assist_player_id)
            if assist_row is not None:
                assist_row.assists += 1

    return sorted(stats.values(), key=lambda s: (-(s.goals + s.assists), s.playerName))
