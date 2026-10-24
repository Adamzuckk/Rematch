"""Independent wall-clock → match-minute mapping for live fixtures.

Each live match runs for LIVE_REAL_DURATION_S real seconds covering 0–90'
match minutes. Clocks are independent via per-match live_started_at.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.event import MatchEvent
from app.models.match import Match

LIVE_REAL_DURATION_S = 180.0
LIVE_MATCH_MINUTES = 90


class MatchNotStartableError(Exception):
    def __init__(self, match_id: str, reason: str) -> None:
        self.match_id = match_id
        self.reason = reason
        super().__init__(reason)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def match_minute_from_elapsed(elapsed_s: float) -> int:
    if elapsed_s <= 0:
        return 0
    ratio = min(1.0, elapsed_s / LIVE_REAL_DURATION_S)
    return min(LIVE_MATCH_MINUTES, int(ratio * LIVE_MATCH_MINUTES))


def elapsed_seconds(live_started_at: datetime, now: datetime | None = None) -> float:
    current = now or utc_now()
    started = live_started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return max(0.0, (current - started).total_seconds())


def score_from_events(
    events: list[MatchEvent],
    *,
    home_team_id: str,
    away_team_id: str,
    max_minute: float | None = None,
) -> tuple[int, int]:
    home = 0
    away = 0
    for event in events:
        if event.type != "shot" or event.outcome != "goal":
            continue
        if max_minute is not None and event.minute is not None and event.minute > max_minute:
            continue
        if event.goal_type == "own_goal":
            # Own goal credits the opposing team.
            if event.team_id == home_team_id:
                away += 1
            elif event.team_id == away_team_id:
                home += 1
            continue
        if event.team_id == home_team_id:
            home += 1
        elif event.team_id == away_team_id:
            away += 1
    return home, away


def sync_match_clock(db: Session, match: Match, *, now: datetime | None = None) -> Match:
    """Advance a live match from wall clock; finish when real duration elapses."""
    if match.status != "live" or match.live_started_at is None:
        return match

    current = now or utc_now()
    elapsed = elapsed_seconds(match.live_started_at, current)
    minute = match_minute_from_elapsed(elapsed)

    events = list(
        db.scalars(select(MatchEvent).where(MatchEvent.match_id == match.id)).all()
    )
    home, away = score_from_events(
        events,
        home_team_id=match.home_team_id,
        away_team_id=match.away_team_id,
        max_minute=float(minute),
    )

    match.minute = minute
    match.home_score = home
    match.away_score = away

    if elapsed >= LIVE_REAL_DURATION_S:
        match.status = "finished"
        match.minute = LIVE_MATCH_MINUTES
        # Final score includes the full planned timeline.
        final_home, final_away = score_from_events(
            events,
            home_team_id=match.home_team_id,
            away_team_id=match.away_team_id,
            max_minute=None,
        )
        match.home_score = final_home
        match.away_score = final_away

    return match


def sync_all_live_matches(db: Session, *, now: datetime | None = None) -> int:
    rows = list(db.scalars(select(Match).where(Match.status == "live")).all())
    for match in rows:
        sync_match_clock(db, match, now=now)
    return len(rows)


def start_upcoming_match(db: Session, match: Match, *, now: datetime | None = None) -> Match:
    if match.status != "upcoming":
        raise MatchNotStartableError(
            match.id,
            f"Match {match.id} cannot be started (status={match.status})",
        )
    current = now or utc_now()
    match.status = "live"
    match.live_started_at = current
    match.minute = 0
    match.home_score = 0
    match.away_score = 0
    return match


def visible_event_cutoff(match: Match) -> float | None:
    """Return max minute for live event visibility; None means full timeline."""
    if match.status == "upcoming":
        return -1.0
    if match.status == "live":
        return float(match.minute if match.minute is not None else 0)
    return None
