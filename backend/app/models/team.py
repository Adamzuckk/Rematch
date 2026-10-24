from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
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
    from app.models.player import Player


class Team(Base):
    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("name", name="uq_teams_name"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(16))
    coach_name: Mapped[str | None] = mapped_column(String(128))
    provenance: Mapped[str] = mapped_column(String(32), nullable=False, default="synthetic")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    players: Mapped[list[Player]] = relationship(back_populates="team")
    form_results: Mapped[list["TeamFormResult"]] = relationship(
        back_populates="team",
        cascade="all, delete-orphan",
    )


class TeamFormResult(Base):
    """Synthetic prior-result form row (not part of the live 6-match catalogue)."""

    __tablename__ = "team_form_results"
    __table_args__ = (
        CheckConstraint("result IN ('W', 'D', 'L')", name="ck_team_form_results_result"),
        CheckConstraint(
            "goals_for >= 0 AND goals_against >= 0",
            name="ck_team_form_results_goals",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    team_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    played_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    opponent_name: Mapped[str] = mapped_column(String(128), nullable=False)
    is_home: Mapped[bool] = mapped_column(nullable=False)
    goals_for: Mapped[int] = mapped_column(Integer, nullable=False)
    goals_against: Mapped[int] = mapped_column(Integer, nullable=False)
    result: Mapped[str] = mapped_column(String(8), nullable=False)
    competition: Mapped[str] = mapped_column(String(128), nullable=False)
    provenance: Mapped[str] = mapped_column(String(32), nullable=False, default="synthetic")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    team: Mapped[Team] = relationship(back_populates="form_results")
