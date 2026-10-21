"""Deterministic match intelligence from seeded events only — no invented stats."""

from __future__ import annotations

from statistics import mean

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.event import MatchEvent
from app.models.frame import MatchFrame
from app.models.match import Match
from app.schemas.intelligence import KeyMomentSchema, MatchIntelligenceSchema
from app.services.matches import MatchNotFoundError

LIMITATIONS = [
    "Aggregates are computed only from seeded synthetic events for this match.",
    "Not official broadcast tracking, possession, or xG.",
    "Averages ignore null metric fields; missing metrics stay null.",
    "Key moments are events that have an aligned frame or stored path metrics.",
    "Geometric decision scores are separate and not mixed into these aggregates.",
]


def _require_match(db: Session, match_id: str) -> Match:
    match = db.get(Match, match_id)
    if match is None:
        raise MatchNotFoundError(match_id)
    return match


def get_match_intelligence(db: Session, match_id: str) -> MatchIntelligenceSchema:
    _require_match(db, match_id)

    events = list(
        db.scalars(
            select(MatchEvent)
            .where(MatchEvent.match_id == match_id)
            .order_by(MatchEvent.minute.asc().nulls_last(), MatchEvent.id)
        ).all()
    )
    frames = list(
        db.scalars(select(MatchFrame).where(MatchFrame.match_id == match_id)).all()
    )
    frame_event_ids = {f.event_id for f in frames if f.event_id}

    counts: dict[str, int] = {}
    with_coords = 0
    path_metrics = 0
    ball_speeds: list[float] = []
    shot_speeds: list[float] = []
    pass_distances: list[float] = []
    key_moments: list[KeyMomentSchema] = []

    for event in events:
        counts[event.type] = counts.get(event.type, 0) + 1
        has_xy = (
            (event.start_x is not None and event.start_y is not None)
            or (event.location_x is not None and event.location_y is not None)
        )
        if has_xy:
            with_coords += 1

        has_path = any(
            getattr(event, field, None) is not None
            for field in ("distance_m", "duration_s", "ball_speed_mps", "shot_speed_mps")
        )
        if has_path:
            path_metrics += 1

        if event.ball_speed_mps is not None:
            ball_speeds.append(float(event.ball_speed_mps))
        if event.shot_speed_mps is not None:
            shot_speeds.append(float(event.shot_speed_mps))
        if event.distance_m is not None and event.type == "pass":
            pass_distances.append(float(event.distance_m))

        aligned = event.id in frame_event_ids
        if aligned or has_path:
            minute_i = int(event.minute) if event.minute is not None else None
            key_moments.append(
                KeyMomentSchema(
                    eventId=event.id,
                    type=event.type,
                    minute=minute_i,
                    second=None,
                    hasAlignedFrame=aligned,
                    hasPathMetrics=has_path,
                    label=f"{event.type} @ {minute_i if minute_i is not None else '?'}'",
                )
            )

    return MatchIntelligenceSchema(
        matchId=match_id,
        eventCounts=counts,
        totalEvents=len(events),
        eventsWithCoordinates=with_coords,
        alignedFrames=len(frames),
        pathMetricsPresent=path_metrics,
        avgBallSpeedMps=round(mean(ball_speeds), 3) if ball_speeds else None,
        avgShotSpeedMps=round(mean(shot_speeds), 3) if shot_speeds else None,
        avgPassDistanceM=round(mean(pass_distances), 3) if pass_distances else None,
        keyMoments=key_moments[:20],
        limitations=list(LIMITATIONS),
    )
