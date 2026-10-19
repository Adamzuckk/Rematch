from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.team import Team


class Player(Base):
    __tablename__ = "players"
    __table_args__ = (
        UniqueConstraint("team_id", "shirt_number", name="uq_players_team_shirt"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    team_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("teams.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    shirt_number: Mapped[int | None] = mapped_column(Integer)
    provenance: Mapped[str] = mapped_column(String(32), nullable=False, default="synthetic")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    team: Mapped[Team] = relationship(back_populates="players")
