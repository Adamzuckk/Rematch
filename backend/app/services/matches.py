"""Match catalogue queries."""

from __future__ import annotations

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, aliased, joinedload, selectinload

from app.models.event import MatchEvent
from app.models.frame import MatchFrame
from app.models.match import Match
from app.models.player import Player
from app.models.scenario import Scenario
from app.models.team import Team
from app.schemas.common import PlayerSchema
from app.schemas.event import MatchEventListResponse, MatchEventSchema
from app.schemas.frame import MatchFrameListResponse, MatchFrameSchema
from app.schemas.match import (
    DashboardOverviewStatSchema,
    MatchDatasetInfoSchema,
    MatchListResponse,
    MatchSummarySchema,
)
from app.services.serializers import (
    event_to_schema,
    frame_to_schema,
    match_to_summary,
    player_to_schema,
)
from app.simulation.generator.match_generator import PHASE8_SCENARIO_ID

SCENARIO_LIMITATIONS = [
    "Not official fixtures, standings, or league records.",
    "No possession, xG, or aggregate match statistics.",
    "Events exist only for a subset of matches and are sparse sample timelines.",
    "Player/ball frames are synthetic snapshots for selected decision moments, not a continuous tracking feed.",
    "Overview decision-moment figures count events with the coordinates required for geometric scoring.",
    "Decision analysis uses geometric_progression_v1 only; not probabilities or xG.",
    "Alternatives require an aligned frame; many events have no frame-backed options.",
]


class MatchNotFoundError(Exception):
    def __init__(self, match_id: str) -> None:
        self.match_id = match_id
        super().__init__(f"Match not found: {match_id}")


def _require_match(db: Session, match_id: str) -> Match:
    match = db.get(Match, match_id)
    if match is None:
        raise MatchNotFoundError(match_id)
    return match


def list_matches(
    db: Session,
    *,
    status: str | None = None,
    competition: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> MatchListResponse:
    home = aliased(Team)
    away = aliased(Team)

    filters = []
    if status:
        filters.append(Match.status == status)
    if competition:
        filters.append(func.lower(Match.competition) == competition.strip().lower())
    if q and q.strip():
        pattern = f"%{q.strip().lower()}%"
        filters.append(
            or_(
                func.lower(Match.competition).like(pattern),
                func.lower(home.name).like(pattern),
                func.lower(away.name).like(pattern),
                func.lower(func.coalesce(home.short_name, "")).like(pattern),
                func.lower(func.coalesce(away.short_name, "")).like(pattern),
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
    stmt = (
        select(Match)
        .where(Match.id == match_id)
        .options(joinedload(Match.home_team), joinedload(Match.away_team))
    )
    match = db.scalars(stmt).unique().first()
    if match is None:
        raise MatchNotFoundError(match_id)
    return match_to_summary(match)


def get_event(db: Session, match_id: str, event_id: str) -> MatchEventSchema | None:
    """Return one typed event only when it belongs to the requested match."""
    event = db.get(MatchEvent, event_id)
    if event is None or event.match_id != match_id:
        return None
    return event_to_schema(event)


def list_events(
    db: Session,
    match_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
) -> MatchEventListResponse:
    _require_match(db, match_id)
    base = select(MatchEvent).where(MatchEvent.match_id == match_id)
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
    _require_match(db, match_id)
    count_base = select(MatchFrame.id).where(MatchFrame.match_id == match_id)
    total = db.scalar(select(func.count()).select_from(count_base.subquery())) or 0
    rows = (
        db.scalars(
            select(MatchFrame)
            .where(MatchFrame.match_id == match_id)
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
    _require_match(db, match_id)
    events = db.scalars(select(MatchEvent).where(MatchEvent.match_id == match_id)).all()
    player_ids: set[str] = set()
    for event in events:
        if event.player_id:
            player_ids.add(event.player_id)
        if event.receiver_id:
            player_ids.add(event.receiver_id)

    frames = (
        db.scalars(
            select(MatchFrame)
            .where(MatchFrame.match_id == match_id)
            .options(selectinload(MatchFrame.players))
        )
        .unique()
        .all()
    )
    for frame in frames:
        for pos in frame.players:
            player_ids.add(pos.player_id)

    if not player_ids:
        return []

    players = db.scalars(
        select(Player).where(Player.id.in_(sorted(player_ids))).order_by(Player.id)
    ).all()
    return [player_to_schema(player) for player in players]


def get_dataset_info(db: Session) -> MatchDatasetInfoSchema | None:
    # Phase 8 is the richest shipped dataset and is the default dataset context
    # for the application. Keep Phase 4 discoverable in the match catalogue and
    # use it as a fallback for existing installations that have not been seeded
    # with Phase 8 yet.
    scenario = db.get(Scenario, PHASE8_SCENARIO_ID)
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
    total = db.scalar(select(func.count()).select_from(Match)) or 0
    live = (
        db.scalar(select(func.count()).select_from(Match).where(Match.status == "live"))
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
    decision_moments = db.scalar(
        select(func.count()).select_from(MatchEvent).where(scorable)
    ) or 0
    return [
        DashboardOverviewStatSchema(
            id="stat-matches",
            label="Demo matches",
            value=str(total),
            hint="Synthetic catalogue size — not a live feed count",
        ),
        DashboardOverviewStatSchema(
            id="stat-live",
            label="Live (demo)",
            value=str(live),
            hint="From seeded fixtures only",
        ),
        DashboardOverviewStatSchema(
            id="stat-decisions",
            label="Decision moments",
            value=str(decision_moments),
            hint="Passes, shots, and carries with the coordinates required for geometric scoring",
        ),
        DashboardOverviewStatSchema(
            id="stat-coverage",
            label="Analysis coverage",
            value="—",
            hint="System metrics dashboard not implemented yet",
        ),
    ]
