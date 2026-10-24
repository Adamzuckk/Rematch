from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.frame import MatchFrame
    from app.models.match import Match


class MatchEvent(Base):
    """Polymorphic match event row (pass/shot/carry/…).

    Coordinate columns follow the frontend PitchPoint 0–100 convention.
    Unused fields for a given type remain NULL (never invent values).
    """

    __tablename__ = "match_events"
    __table_args__ = (
        CheckConstraint(
            "type IN ("
            "'pass', 'shot', 'carry', 'tackle', 'pressure', 'possession_change', "
            "'foul', 'yellow_card', 'red_card', 'substitution', 'offside', "
            "'counterattack', 'reverse_attack', 'counter_press'"
            ")",
            name="ck_match_events_type",
        ),
        CheckConstraint(
            "minute IS NULL OR minute >= 0",
            name="ck_match_events_minute",
        ),
        CheckConstraint(
            "(start_x IS NULL AND start_y IS NULL) OR "
            "(start_x IS NOT NULL AND start_y IS NOT NULL AND "
            "start_x >= 0 AND start_x <= 100 AND start_y >= 0 AND start_y <= 100)",
            name="ck_match_events_start_xy",
        ),
        CheckConstraint(
            "(end_x IS NULL AND end_y IS NULL) OR "
            "(end_x IS NOT NULL AND end_y IS NOT NULL AND "
            "end_x >= 0 AND end_x <= 100 AND end_y >= 0 AND end_y <= 100)",
            name="ck_match_events_end_xy",
        ),
        CheckConstraint(
            "(location_x IS NULL AND location_y IS NULL) OR "
            "(location_x IS NOT NULL AND location_y IS NOT NULL AND "
            "location_x >= 0 AND location_x <= 100 AND "
            "location_y >= 0 AND location_y <= 100)",
            name="ck_match_events_location_xy",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    match_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("matches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    minute: Mapped[float | None] = mapped_column(Float)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    team_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("teams.id", ondelete="SET NULL"),
        index=True,
    )
    player_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("players.id", ondelete="SET NULL"),
        index=True,
    )
    receiver_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("players.id", ondelete="SET NULL"),
    )
    start_x: Mapped[float | None] = mapped_column(Float)
    start_y: Mapped[float | None] = mapped_column(Float)
    end_x: Mapped[float | None] = mapped_column(Float)
    end_y: Mapped[float | None] = mapped_column(Float)
    location_x: Mapped[float | None] = mapped_column(Float)
    location_y: Mapped[float | None] = mapped_column(Float)
    outcome: Mapped[str | None] = mapped_column(String(32))
    gained_by_team_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("teams.id", ondelete="SET NULL"),
    )
    assist_player_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("players.id", ondelete="SET NULL"),
    )
    related_player_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("players.id", ondelete="SET NULL"),
    )
    goal_type: Mapped[str | None] = mapped_column(String(32))
    detail: Mapped[str | None] = mapped_column(String(64))
    # Phase 8 generator-derived model estimates (nullable; not real measurements).
    distance_m: Mapped[float | None] = mapped_column(Float)
    duration_s: Mapped[float | None] = mapped_column(Float)
    ball_speed_mps: Mapped[float | None] = mapped_column(Float)
    shot_speed_mps: Mapped[float | None] = mapped_column(Float)
    provenance: Mapped[str] = mapped_column(String(32), nullable=False, default="synthetic")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    match: Mapped[Match] = relationship(back_populates="events")
    frames: Mapped[list[MatchFrame]] = relationship(back_populates="event")
