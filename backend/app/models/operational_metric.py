"""Persisted, append-only telemetry for ReMatch operational requests.

This is deliberately separate from synthetic match data.  A row is written
only when an instrumented API operation actually runs; seed data never creates
telemetry rows.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OperationalMetricEvent(Base):
    __tablename__ = "operational_metric_events"
    __table_args__ = (
        CheckConstraint(
            "operation IN ('analysis', 'verification')",
            name="ck_operational_metric_events_operation",
        ),
        CheckConstraint(
            "outcome IN ('success', 'failure')",
            name="ck_operational_metric_events_outcome",
        ),
        CheckConstraint(
            "latency_ms >= 0", name="ck_operational_metric_events_latency_ms"
        ),
        CheckConstraint(
            "verified_claims >= 0", name="ck_operational_metric_events_verified_claims"
        ),
        CheckConstraint(
            "partial_claims >= 0", name="ck_operational_metric_events_partial_claims"
        ),
        CheckConstraint(
            "unsupported_claims >= 0",
            name="ck_operational_metric_events_unsupported_claims",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    operation: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    outcome: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    failure_code: Mapped[str | None] = mapped_column(String(64))
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    # Reserved for a real fallback path. The current deterministic engine has
    # none, so the dashboard reports this metric as unavailable rather than 0.
    fallback_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_claims: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    partial_claims: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unsupported_claims: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
