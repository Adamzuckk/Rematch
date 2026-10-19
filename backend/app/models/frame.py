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
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.event import MatchEvent
    from app.models.match import Match


class MatchFrame(Base):
    """Pitch snapshot optionally aligned to an event."""

    __tablename__ = "match_frames"
    __table_args__ = (
        CheckConstraint(
            "(ball_x IS NULL AND ball_y IS NULL) OR "
            "(ball_x IS NOT NULL AND ball_y IS NOT NULL AND "
            "ball_x >= 0 AND ball_x <= 100 AND ball_y >= 0 AND ball_y <= 100)",
            name="ck_match_frames_ball_xy",
        ),
        CheckConstraint(
            "minute IS NULL OR minute >= 0",
            name="ck_match_frames_minute",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    match_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("matches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("match_events.id", ondelete="SET NULL"),
        index=True,
    )
    minute: Mapped[int | None] = mapped_column(Integer)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ball_x: Mapped[float | None] = mapped_column(Float)
    ball_y: Mapped[float | None] = mapped_column(Float)
    provenance: Mapped[str] = mapped_column(String(32), nullable=False, default="synthetic")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    match: Mapped[Match] = relationship(back_populates="frames")
    event: Mapped[MatchEvent | None] = relationship(back_populates="frames")
    players: Mapped[list[PlayerFramePosition]] = relationship(
        back_populates="frame",
        cascade="all, delete-orphan",
    )


class PlayerFramePosition(Base):
    """One player marker inside a MatchFrame."""

    __tablename__ = "player_frame_positions"
    __table_args__ = (
        UniqueConstraint("frame_id", "player_id", name="uq_player_frame_positions"),
        CheckConstraint(
            "x >= 0 AND x <= 100 AND y >= 0 AND y <= 100",
            name="ck_player_frame_positions_xy",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    frame_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("match_frames.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    player_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("players.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    team_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("teams.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)

    frame: Mapped[MatchFrame] = relationship(back_populates="players")
