from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, UniqueConstraint, func
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
    provenance: Mapped[str] = mapped_column(String(32), nullable=False, default="synthetic")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    players: Mapped[list[Player]] = relationship(back_populates="team")
