from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
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
    from app.models.frame import MatchFrame
    from app.models.scenario import Scenario
    from app.models.team import Team


class Match(Base):
    __tablename__ = "matches"
    __table_args__ = (
        UniqueConstraint(
            "scenario_id",
            "home_team_id",
            "away_team_id",
            "kickoff_at",
            name="uq_matches_scenario_fixture",
        ),
        CheckConstraint(
            "home_team_id <> away_team_id",
            name="ck_matches_distinct_teams",
        ),
        CheckConstraint(
            "status IN ('live', 'finished', 'upcoming')",
            name="ck_matches_status",
        ),
        CheckConstraint(
            "home_score IS NULL OR home_score >= 0",
            name="ck_matches_home_score",
        ),
        CheckConstraint(
            "away_score IS NULL OR away_score >= 0",
            name="ck_matches_away_score",
        ),
        CheckConstraint(
            "minute IS NULL OR (minute >= 0 AND minute <= 150)",
            name="ck_matches_minute",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("scenarios.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    competition: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    home_team_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("teams.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    away_team_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("teams.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    kickoff_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    home_score: Mapped[int | None] = mapped_column(Integer)
    away_score: Mapped[int | None] = mapped_column(Integer)
    minute: Mapped[int | None] = mapped_column(Integer)
    venue: Mapped[str | None] = mapped_column(String(128))
    live_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    home_formation: Mapped[str | None] = mapped_column(String(16))
    away_formation: Mapped[str | None] = mapped_column(String(16))
    planned_home_score: Mapped[int | None] = mapped_column(Integer)
    planned_away_score: Mapped[int | None] = mapped_column(Integer)
    provenance: Mapped[str] = mapped_column(String(32), nullable=False, default="synthetic")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    scenario: Mapped[Scenario] = relationship(back_populates="matches")
    home_team: Mapped[Team] = relationship(foreign_keys=[home_team_id])
    away_team: Mapped[Team] = relationship(foreign_keys=[away_team_id])
    events: Mapped[list[MatchEvent]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
    )
    frames: Mapped[list[MatchFrame]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
    )
