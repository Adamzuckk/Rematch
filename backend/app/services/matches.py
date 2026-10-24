"""Match catalogue queries with live-clock sync and enrichment."""

from __future__ import annotations

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, aliased, joinedload, selectinload

from app.models.event import MatchEvent
from app.models.frame import MatchFrame
from app.models.match import Match
from app.models.player import Player
from app.models.scenario import Scenario
from app.models.team import Team, TeamFormResult
from app.schemas.common import PlayerSchema
from app.schemas.enrichment import (
    MatchContextSchema,
    PlayerMatchStatsSchema,
    StartMatchResponseSchema,
    TeamDetailSchema,
    TeamFormResultSchema,
)
from app.schemas.event import MatchEventListResponse, MatchEventSchema
from app.schemas.frame import MatchFrameListResponse, MatchFrameSchema
from app.schemas.match import (
    DashboardOverviewStatSchema,
    MatchDatasetInfoSchema,
    MatchListResponse,
    MatchSummarySchema,
)
from app.services import live_clock
from app.services.serializers import (
    compute_player_stats,
    event_to_schema,
    form_to_schema,
    frame_to_schema,
    match_to_summary,
    player_to_schema,
    team_to_schema,
)
from app.simulation.rich_catalogue import RICH_SCENARIO_ID

SCENARIO_LIMITATIONS = [
    "Synthetic fixtures only — not official league records.",
    "Three live matches each compress 90' into 3 real minutes with independent clocks.",
    "Upcoming Lakeside–Ironford starts only via POST /matches/{id}/start.",
    "Player stats and form are derived from the seeded synthetic timeline.",
    "Decision analysis uses geometric_progression_v1 only; not probabilities or xG.",
    "Alternatives require an aligned frame; some events have no frame-backed options.",
]


class MatchNotFoundError(Exception):
    def __init__(self, match_id: str) -> None:
        self.match_id = match_id
        super().__init__(f"Match not found: {match_id}")


class TeamNotFoundError(Exception):
    def __init__(self, team_id: str) -> None:
        self.team_id = team_id
        super().__init__(f"Team not found: {team_id}")


def resolve_catalogue_scenario_id(db: Session) -> str | None:
    """Prefer the rich 6-match catalogue; otherwise the densest seeded scenario."""
    rich_count = (
        db.scalar(
            select(func.count())
            .select_from(Match)
            .where(Match.scenario_id == RICH_SCENARIO_ID)
        )
        or 0
    )
    if rich_count > 0:
        return RICH_SCENARIO_ID
    return db.scalars(
        select(Match.scenario_id)
        .group_by(Match.scenario_id)
        .order_by(func.count().desc(), Match.scenario_id.desc())
    ).first()


def _require_match(db: Session, match_id: str) -> Match:
    match = db.get(Match, match_id)
    if match is None:
        raise MatchNotFoundError(match_id)
    live_clock.sync_match_clock(db, match)
    return match


def _load_match(db: Session, match_id: str) -> Match:
    stmt = (
        select(Match)
        .where(Match.id == match_id)
        .options(joinedload(Match.home_team), joinedload(Match.away_team))
    )
    match = db.scalars(stmt).unique().first()
    if match is None:
        raise MatchNotFoundError(match_id)
    live_clock.sync_match_clock(db, match)
    return match


def list_matches(
    db: Session,
    *,
    status: str | None = None,
    competition: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
    scenario_id: str | None = None,
) -> MatchListResponse:
    live_clock.sync_all_live_matches(db)

    home = aliased(Team)
    away = aliased(Team)

    filters = []
    resolved_scenario = (
        scenario_id if scenario_id is not None else resolve_catalogue_scenario_id(db)
    )
    if resolved_scenario:
        filters.append(Match.scenario_id == resolved_scenario)
    if status:
        filters.append(Match.status == status)
    if competition:
        filters.append(func.lower(Match.competition) == competition.strip().lower())
    if q and q.strip():
        escaped = (
            q.strip()
            .lower()
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        pattern = f"%{escaped}%"
        filters.append(
            or_(
                func.lower(Match.competition).like(pattern, escape="\\"),
                func.lower(home.name).like(pattern, escape="\\"),
                func.lower(away.name).like(pattern, escape="\\"),
                func.lower(func.coalesce(home.short_name, "")).like(
                    pattern, escape="\\"
                ),
                func.lower(func.coalesce(away.short_name, "")).like(
                    pattern, escape="\\"
                ),
            )
        )

    base = (
        select(Match)
        .join(home, Match.home_team_id == home.id)
        .join(away, Match.away_team_id == away.id)
        .where(*filters)
    )

    total = db.scalar(select(func.count()).select_from(base.order_by(None).subquery())) or 0

    rows = (
        db.scalars(
            base.options(joinedload(Match.home_team), joinedload(Match.away_team))
            .order_by(Match.kickoff_at.desc(), Match.id)
            .limit(limit)
            .offset(offset)
        )
        .unique()
        .all()
    )

    return MatchListResponse(
        items=[match_to_summary(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


def get_match(db: Session, match_id: str) -> MatchSummarySchema:
    return match_to_summary(_load_match(db, match_id))


def get_event(db: Session, match_id: str, event_id: str) -> MatchEventSchema | None:
    """Return one typed event only when it belongs to the requested match."""
    match = _require_match(db, match_id)
    event = db.get(MatchEvent, event_id)
    if event is None or event.match_id != match_id:
        return None
    cutoff = live_clock.visible_event_cutoff(match)
    if cutoff is not None and (event.minute is None or event.minute > cutoff):
        return None
    return event_to_schema(event)


def list_events(
    db: Session,
    match_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
) -> MatchEventListResponse:
    match = _require_match(db, match_id)
    cutoff = live_clock.visible_event_cutoff(match)
    filters = [MatchEvent.match_id == match_id]
    if cutoff is not None:
        filters.append(MatchEvent.minute.is_not(None))
        filters.append(MatchEvent.minute <= cutoff)

    base = select(MatchEvent).where(*filters)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(
        base.order_by(MatchEvent.minute.asc().nulls_last(), MatchEvent.id)
        .limit(limit)
        .offset(offset)
    ).all()
    items: list[MatchEventSchema] = [event_to_schema(row) for row in rows]
    return MatchEventListResponse(items=items, total=total, limit=limit, offset=offset)


def list_frames(
    db: Session,
    match_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
) -> MatchFrameListResponse:
    match = _require_match(db, match_id)
    cutoff = live_clock.visible_event_cutoff(match)
    filters = [MatchFrame.match_id == match_id]
    if cutoff is not None:
        filters.append(MatchFrame.minute.is_not(None))
        filters.append(MatchFrame.minute <= cutoff)

    count_base = select(MatchFrame.id).where(*filters)
    total = db.scalar(select(func.count()).select_from(count_base.subquery())) or 0
    rows = (
        db.scalars(
            select(MatchFrame)
            .where(*filters)
            .options(selectinload(MatchFrame.players))
            .order_by(MatchFrame.minute.asc().nulls_last(), MatchFrame.id)
            .limit(limit)
            .offset(offset)
        )
        .unique()
        .all()
    )
    items: list[MatchFrameSchema] = [frame_to_schema(row) for row in rows]
    return MatchFrameListResponse(items=items, total=total, limit=limit, offset=offset)


def list_players_for_match(db: Session, match_id: str) -> list[PlayerSchema]:
    match = _require_match(db, match_id)
    players = db.scalars(
        select(Player)
        .where(Player.team_id.in_([match.home_team_id, match.away_team_id]))
        .order_by(Player.team_id, Player.shirt_number, Player.id)
    ).all()
    return [player_to_schema(player) for player in players]


def list_team_form(db: Session, team_id: str) -> list[TeamFormResultSchema]:
    team = db.get(Team, team_id)
    if team is None:
        raise TeamNotFoundError(team_id)
    rows = db.scalars(
        select(TeamFormResult)
        .where(TeamFormResult.team_id == team_id)
        .order_by(TeamFormResult.played_at.desc(), TeamFormResult.id)
        .limit(5)
    ).all()
    return [form_to_schema(row) for row in rows]


def get_team_detail(db: Session, team_id: str) -> TeamDetailSchema:
    team = db.get(Team, team_id)
    if team is None:
        raise TeamNotFoundError(team_id)
    return TeamDetailSchema(team=team_to_schema(team), form=list_team_form(db, team_id))


def list_player_stats(db: Session, match_id: str) -> list[PlayerMatchStatsSchema]:
    match = _require_match(db, match_id)
    cutoff = live_clock.visible_event_cutoff(match)
    filters = [MatchEvent.match_id == match_id]
    if cutoff is not None:
        filters.append(MatchEvent.minute.is_not(None))
        filters.append(MatchEvent.minute <= cutoff)
    events = list(db.scalars(select(MatchEvent).where(*filters)).all())
    players = list(
        db.scalars(
            select(Player).where(
                Player.team_id.in_([match.home_team_id, match.away_team_id])
            )
        ).all()
    )
    return compute_player_stats(events, players)


def get_match_context(db: Session, match_id: str) -> MatchContextSchema:
    match = _load_match(db, match_id)
    players = list(
        db.scalars(
            select(Player)
            .where(Player.team_id.in_([match.home_team_id, match.away_team_id]))
            .order_by(Player.team_id, Player.shirt_number, Player.id)
        ).all()
    )
    home_players = [p for p in players if p.team_id == match.home_team_id]
    away_players = [p for p in players if p.team_id == match.away_team_id]
    return MatchContextSchema(
        match=match_to_summary(match),
        homeCoachName=match.home_team.coach_name,
        awayCoachName=match.away_team.coach_name,
        homeForm=list_team_form(db, match.home_team_id),
        awayForm=list_team_form(db, match.away_team_id),
        playerStats=list_player_stats(db, match_id),
        homePlayers=[player_to_schema(p) for p in home_players],
        awayPlayers=[player_to_schema(p) for p in away_players],
    )


def start_match(db: Session, match_id: str) -> StartMatchResponseSchema:
    match = _load_match(db, match_id)
    try:
        live_clock.start_upcoming_match(db, match)
    except live_clock.MatchNotStartableError as exc:
        raise MatchNotStartableError(exc.match_id, exc.reason) from exc
    db.flush()
    return StartMatchResponseSchema(match=match_to_summary(match))


class MatchNotStartableError(Exception):
    def __init__(self, match_id: str, reason: str) -> None:
        self.match_id = match_id
        self.reason = reason
        super().__init__(reason)


def get_dataset_info(db: Session) -> MatchDatasetInfoSchema | None:
    scenario_id = resolve_catalogue_scenario_id(db)
    scenario = db.get(Scenario, scenario_id) if scenario_id else None
    if scenario is None:
        scenario = db.scalars(
            select(Scenario).order_by(Scenario.updated_at.desc(), Scenario.id.desc())
        ).first()
    if scenario is None:
        return None
    match_count = (
        db.scalar(
            select(func.count()).select_from(Match).where(Match.scenario_id == scenario.id)
        )
        or 0
    )
    return MatchDatasetInfoSchema(
        scenarioId=scenario.id,
        provenance=scenario.provenance,  # type: ignore[arg-type]
        description=scenario.description,
        matchCount=match_count,
        limitations=list(SCENARIO_LIMITATIONS),
    )


def get_overview_stats(db: Session) -> list[DashboardOverviewStatSchema]:
    live_clock.sync_all_live_matches(db)
    scenario_id = resolve_catalogue_scenario_id(db)
    match_filters = []
    if scenario_id is not None:
        match_filters.append(Match.scenario_id == scenario_id)
    total = (
        db.scalar(select(func.count()).select_from(Match).where(*match_filters)) or 0
    )
    live = (
        db.scalar(
            select(func.count())
            .select_from(Match)
            .where(*match_filters, Match.status == "live")
        )
        or 0
    )
    scorable = and_(
        or_(
            and_(
                MatchEvent.type.in_(("pass", "carry")),
                MatchEvent.start_x.is_not(None),
                MatchEvent.start_y.is_not(None),
                MatchEvent.end_x.is_not(None),
                MatchEvent.end_y.is_not(None),
            ),
            and_(
                MatchEvent.type == "shot",
                MatchEvent.location_x.is_not(None),
                MatchEvent.location_y.is_not(None),
            ),
        )
    )
    decision_moments = (
        db.scalar(
            select(func.count())
            .select_from(MatchEvent)
            .join(Match, MatchEvent.match_id == Match.id)
            .where(*match_filters, scorable)
        )
        or 0
    )
    match_hint = (
        "Exactly six synthetic fixtures in the live catalogue"
        if scenario_id == RICH_SCENARIO_ID
        else "Seeded synthetic fixtures in the active catalogue"
    )
    return [
        DashboardOverviewStatSchema(
            id="stat-matches",
            label="Demo matches",
            value=str(total),
            hint=match_hint,
        ),
        DashboardOverviewStatSchema(
            id="stat-live",
            label="Live (sim)",
            value=str(live),
            hint="Independent 3-minute wall clocks mapped to 90'",
        ),
        DashboardOverviewStatSchema(
            id="stat-decisions",
            label="Decision moments",
            value=str(decision_moments),
            hint="Passes, shots, and carries with coordinates required for geometric scoring",
        ),
        DashboardOverviewStatSchema(
            id="stat-coverage",
            label="Operational telemetry",
            value="—",
            hint="Recorded analysis coverage and latency are available on System Metrics",
        ),
    ]
