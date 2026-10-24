"""Add persistent operational telemetry for analysis and verification API runs.

Revision ID: 20261022_0003
Revises: 20261020_0002
Create Date: 2026-10-22 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261022_0003"
down_revision: Union[str, Sequence[str], None] = "20261020_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "operational_metric_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("operation", sa.String(length=24), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("failure_code", sa.String(length=64), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("fallback_used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("verified_claims", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("partial_claims", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unsupported_claims", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("operation IN ('analysis', 'verification')", name="ck_operational_metric_events_operation"),
        sa.CheckConstraint("outcome IN ('success', 'failure')", name="ck_operational_metric_events_outcome"),
        sa.CheckConstraint("latency_ms >= 0", name="ck_operational_metric_events_latency_ms"),
        sa.CheckConstraint("verified_claims >= 0", name="ck_operational_metric_events_verified_claims"),
        sa.CheckConstraint("partial_claims >= 0", name="ck_operational_metric_events_partial_claims"),
        sa.CheckConstraint("unsupported_claims >= 0", name="ck_operational_metric_events_unsupported_claims"),
    )
    op.create_index("ix_operational_metric_events_occurred_at", "operational_metric_events", ["occurred_at"])
    op.create_index("ix_operational_metric_events_operation", "operational_metric_events", ["operation"])
    op.create_index("ix_operational_metric_events_outcome", "operational_metric_events", ["outcome"])


def downgrade() -> None:
    op.drop_table("operational_metric_events")
