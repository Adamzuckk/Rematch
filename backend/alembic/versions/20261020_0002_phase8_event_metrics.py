"""Phase 8: optional synthetic pass/shot metric columns on match_events.

Revision ID: 20261020_0002
Revises: 20261019_0001
Create Date: 2026-10-20 00:00:00.000000

These columns store generator-derived model estimates only (not real match
measurements). All are nullable so existing Phase 4 rows remain valid.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261020_0002"
down_revision: Union[str, Sequence[str], None] = "20261019_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("match_events") as batch_op:
        batch_op.add_column(sa.Column("distance_m", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("duration_s", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("ball_speed_mps", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("shot_speed_mps", sa.Float(), nullable=True))
        batch_op.create_check_constraint(
            "ck_match_events_distance_m",
            "distance_m IS NULL OR distance_m >= 0",
        )
        batch_op.create_check_constraint(
            "ck_match_events_duration_s",
            "duration_s IS NULL OR duration_s > 0",
        )
        batch_op.create_check_constraint(
            "ck_match_events_ball_speed_mps",
            "ball_speed_mps IS NULL OR ball_speed_mps >= 0",
        )
        batch_op.create_check_constraint(
            "ck_match_events_shot_speed_mps",
            "shot_speed_mps IS NULL OR shot_speed_mps >= 0",
        )


def downgrade() -> None:
    with op.batch_alter_table("match_events") as batch_op:
        batch_op.drop_constraint("ck_match_events_shot_speed_mps", type_="check")
        batch_op.drop_constraint("ck_match_events_ball_speed_mps", type_="check")
        batch_op.drop_constraint("ck_match_events_duration_s", type_="check")
        batch_op.drop_constraint("ck_match_events_distance_m", type_="check")
        batch_op.drop_column("shot_speed_mps")
        batch_op.drop_column("ball_speed_mps")
        batch_op.drop_column("duration_s")
        batch_op.drop_column("distance_m")
