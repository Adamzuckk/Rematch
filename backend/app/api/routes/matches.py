from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_dep, get_settings_dep
from app.core.config import Settings
from app.schemas.common import ErrorResponse, PlayerSchema
from app.schemas.enrichment import (
    MatchContextSchema,
    PlayerMatchStatsSchema,
    StartMatchResponseSchema,
    TeamDetailSchema,
    TeamFormResultSchema,
)
from app.schemas.event import MatchEventListResponse
from app.schemas.frame import MatchFrameListResponse
from app.schemas.match import (
    DashboardOverviewStatSchema,
    MatchDatasetInfoSchema,
    MatchListResponse,
    MatchSummarySchema,
)
from app.services import matches as match_service
from app.services import intelligence as intelligence_service
from app.schemas.intelligence import MatchIntelligenceSchema

router = APIRouter(prefix="/matches", tags=["matches"])

MatchStatusQuery = Literal["live", "finished", "upcoming"]
MatchIdPath = Annotated[str, Path(min_length=1, max_length=128)]
_MAX_SEARCH_LEN = 100
_MAX_COMPETITION_LEN = 120


def _pagination(
    settings: Settings,
    limit: int | None,
    offset: int,
) -> tuple[int, int]:
    resolved_limit = settings.default_page_limit if limit is None else limit
    if resolved_limit < 1 or resolved_limit > settings.max_page_limit:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_limit",
                "message": (
                    f"limit must be between 1 and {settings.max_page_limit} "
                    f"(got {resolved_limit})"
                ),
            },
        )
    if offset < 0:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_offset",
                "message": "offset must be >= 0",
            },
        )
    return resolved_limit, offset


@router.get(
    "",
    response_model=MatchListResponse,
    responses={422: {"model": ErrorResponse}},
)
def list_matches(
    db: Annotated[Session, Depends(get_db_dep)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    status_filter: Annotated[
        MatchStatusQuery | None,
        Query(alias="status", description="Filter by match status"),
    ] = None,
    competition: Annotated[
        str | None,
        Query(
            description="Case-insensitive exact competition name",
            max_length=_MAX_COMPETITION_LEN,
        ),
    ] = None,
    q: Annotated[
        str | None,
        Query(
            description="Search team names, short names, or competition",
            max_length=_MAX_SEARCH_LEN,
        ),
    ] = None,
    limit: Annotated[int | None, Query(ge=1)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> MatchListResponse:
    resolved_limit, resolved_offset = _pagination(settings, limit, offset)
    return match_service.list_matches(
        db,
        status=status_filter,
        competition=competition,
        q=q,
        limit=resolved_limit,
        offset=resolved_offset,
    )


@router.get(
    "/dataset",
    response_model=MatchDatasetInfoSchema,
    responses={404: {"model": ErrorResponse}},
)
def get_dataset(
    db: Annotated[Session, Depends(get_db_dep)],
) -> MatchDatasetInfoSchema:
    info = match_service.get_dataset_info(db)
    if info is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "dataset_not_found",
                "message": "No seeded scenario is available. Run rematch-seed.",
            },
        )
    return info


@router.get("/overview", response_model=list[DashboardOverviewStatSchema])
def get_overview(
    db: Annotated[Session, Depends(get_db_dep)],
) -> list[DashboardOverviewStatSchema]:
    return match_service.get_overview_stats(db)


@router.get(
    "/teams/{team_id}",
    response_model=TeamDetailSchema,
    responses={404: {"model": ErrorResponse}},
)
def get_team_detail(
    team_id: Annotated[str, Path(min_length=1, max_length=128)],
    db: Annotated[Session, Depends(get_db_dep)],
) -> TeamDetailSchema:
    try:
        return match_service.get_team_detail(db, team_id)
    except match_service.TeamNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "team_not_found",
                "message": f"Team not found: {exc.team_id}",
            },
        ) from None


@router.get(
    "/teams/{team_id}/form",
    response_model=list[TeamFormResultSchema],
    responses={404: {"model": ErrorResponse}},
)
def get_team_form(
    team_id: Annotated[str, Path(min_length=1, max_length=128)],
    db: Annotated[Session, Depends(get_db_dep)],
) -> list[TeamFormResultSchema]:
    try:
        return match_service.list_team_form(db, team_id)
    except match_service.TeamNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "team_not_found",
                "message": f"Team not found: {exc.team_id}",
            },
        ) from None


@router.get(
    "/{match_id}",
    response_model=MatchSummarySchema,
    responses={404: {"model": ErrorResponse}},
)
def get_match(
    match_id: MatchIdPath,
    db: Annotated[Session, Depends(get_db_dep)],
) -> MatchSummarySchema:
    try:
        return match_service.get_match(db, match_id)
    except match_service.MatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "match_not_found",
                "message": f"Match not found: {exc.match_id}",
            },
        ) from None


@router.get(
    "/{match_id}/events",
    response_model=MatchEventListResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def get_match_events(
    match_id: MatchIdPath,
    db: Annotated[Session, Depends(get_db_dep)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    limit: Annotated[int | None, Query(ge=1)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> MatchEventListResponse:
    resolved_limit, resolved_offset = _pagination(settings, limit, offset)
    try:
        return match_service.list_events(
            db, match_id, limit=resolved_limit, offset=resolved_offset
        )
    except match_service.MatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "match_not_found",
                "message": f"Match not found: {exc.match_id}",
            },
        ) from None


@router.get(
    "/{match_id}/frames",
    response_model=MatchFrameListResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def get_match_frames(
    match_id: MatchIdPath,
    db: Annotated[Session, Depends(get_db_dep)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    limit: Annotated[int | None, Query(ge=1)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> MatchFrameListResponse:
    resolved_limit, resolved_offset = _pagination(settings, limit, offset)
    try:
        return match_service.list_frames(
            db, match_id, limit=resolved_limit, offset=resolved_offset
        )
    except match_service.MatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "match_not_found",
                "message": f"Match not found: {exc.match_id}",
            },
        ) from None


@router.get(
    "/{match_id}/players",
    response_model=list[PlayerSchema],
    responses={404: {"model": ErrorResponse}},
)
def get_match_players(
    match_id: MatchIdPath,
    db: Annotated[Session, Depends(get_db_dep)],
) -> list[PlayerSchema]:
    try:
        return match_service.list_players_for_match(db, match_id)
    except match_service.MatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "match_not_found",
                "message": f"Match not found: {exc.match_id}",
            },
        ) from None

@router.get(
    "/{match_id}/intelligence",
    response_model=MatchIntelligenceSchema,
    responses={404: {"model": ErrorResponse}},
)
def get_match_intelligence(
    match_id: MatchIdPath,
    db: Annotated[Session, Depends(get_db_dep)],
) -> MatchIntelligenceSchema:
    """Aggregates derived only from seeded synthetic events/frames for this match."""
    try:
        return intelligence_service.get_match_intelligence(db, match_id)
    except match_service.MatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "match_not_found",
                "message": f"Match not found: {exc.match_id}",
            },
        ) from None


@router.get(
    "/{match_id}/context",
    response_model=MatchContextSchema,
    responses={404: {"model": ErrorResponse}},
)
def get_match_context(
    match_id: MatchIdPath,
    db: Annotated[Session, Depends(get_db_dep)],
) -> MatchContextSchema:
    """Coaches, 5-match form, squads, and player stats for one fixture."""
    try:
        return match_service.get_match_context(db, match_id)
    except match_service.MatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "match_not_found",
                "message": f"Match not found: {exc.match_id}",
            },
        ) from None


@router.get(
    "/{match_id}/player-stats",
    response_model=list[PlayerMatchStatsSchema],
    responses={404: {"model": ErrorResponse}},
)
def get_match_player_stats(
    match_id: MatchIdPath,
    db: Annotated[Session, Depends(get_db_dep)],
) -> list[PlayerMatchStatsSchema]:
    try:
        return match_service.list_player_stats(db, match_id)
    except match_service.MatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "match_not_found",
                "message": f"Match not found: {exc.match_id}",
            },
        ) from None


@router.post(
    "/{match_id}/start",
    response_model=StartMatchResponseSchema,
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def start_match(
    match_id: MatchIdPath,
    db: Annotated[Session, Depends(get_db_dep)],
) -> StartMatchResponseSchema:
    """Start the upcoming Lakeside–Ironford (or any upcoming) match on request."""
    try:
        result = match_service.start_match(db, match_id)
        db.commit()
        return result
    except match_service.MatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "match_not_found",
                "message": f"Match not found: {exc.match_id}",
            },
        ) from None
    except match_service.MatchNotStartableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "match_not_startable",
                "message": exc.reason,
            },
        ) from None

