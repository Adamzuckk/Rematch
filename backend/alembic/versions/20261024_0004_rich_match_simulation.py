"""Rich match simulation: live clocks, coaches, form, expanded events.

Revision ID: 20261024_0004
Revises: 20261022_0003
Create Date: 2026-10-24 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261024_0004"
down_revision: Union[str, Sequence[str], None] = "20261022_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_EVENT_TYPES = (
    "pass",
    "shot",
    "carry",
    "tackle",
    "pressure",
    "possession_change",
    "foul",
    "yellow_card",
    "red_card",
    "substitution",
    "offside",
    "counterattack",
    "reverse_attack",
    "counter_press",
)


def upgrade() -> None:
    with op.batch_alter_table("teams") as batch_op:
        batch_op.add_column(sa.Column("coach_name", sa.String(length=128), nullable=True))

    with op.batch_alter_table("players") as batch_op:
        batch_op.add_column(sa.Column("role", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("position_slot", sa.String(length=16), nullable=True))

    with op.batch_alter_table("matches") as batch_op:
        batch_op.add_column(
            sa.Column("live_started_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(sa.Column("home_formation", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("away_formation", sa.String(length=16), nullable=True))
        batch_op.add_column(
            sa.Column("planned_home_score", sa.Integer(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("planned_away_score", sa.Integer(), nullable=True)
        )

    with op.batch_alter_table("match_events") as batch_op:
        batch_op.drop_constraint("ck_match_events_type", type_="check")
        batch_op.create_check_constraint(
            "ck_match_events_type",
            "type IN (" + ", ".join(f"'{t}'" for t in _EVENT_TYPES) + ")",
        )
        batch_op.add_column(
            sa.Column("assist_player_id", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(
            sa.Column("related_player_id", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(sa.Column("goal_type", sa.String(length=32), nullable=True))
        batch_op.add_column(
            sa.Column("detail", sa.String(length=64), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_match_events_assist_player_id",
            "players",
            ["assist_player_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_match_events_related_player_id",
            "players",
            ["related_player_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.create_table(
        "team_form_results",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("played_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("opponent_name", sa.String(length=128), nullable=False),
        sa.Column("is_home", sa.Boolean(), nullable=False),
        sa.Column("goals_for", sa.Integer(), nullable=False),
        sa.Column("goals_against", sa.Integer(), nullable=False),
        sa.Column("result", sa.String(length=8), nullable=False),
        sa.Column("competition", sa.String(length=128), nullable=False),
        sa.Column("provenance", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "result IN ('W', 'D', 'L')",
            name="ck_team_form_results_result",
        ),
        sa.CheckConstraint(
            "goals_for >= 0 AND goals_against >= 0",
            name="ck_team_form_results_goals",
        ),
    )
    op.create_index(
        "ix_team_form_results_team_id",
        "team_form_results",
        ["team_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_team_form_results_team_id", table_name="team_form_results")
    op.drop_table("team_form_results")

    with op.batch_alter_table("match_events") as batch_op:
        batch_op.drop_constraint("fk_match_events_related_player_id", type_="foreignkey")
        batch_op.drop_constraint("fk_match_events_assist_player_id", type_="foreignkey")
        batch_op.drop_column("detail")
        batch_op.drop_column("goal_type")
        batch_op.drop_column("related_player_id")
        batch_op.drop_column("assist_player_id")
        batch_op.drop_constraint("ck_match_events_type", type_="check")
        batch_op.create_check_constraint(
            "ck_match_events_type",
            "type IN ('pass', 'shot', 'carry', 'tackle', 'pressure', 'possession_change')",
        )

    with op.batch_alter_table("matches") as batch_op:
        batch_op.drop_column("planned_away_score")
        batch_op.drop_column("planned_home_score")
        batch_op.drop_column("away_formation")
        batch_op.drop_column("home_formation")
        batch_op.drop_column("live_started_at")

    with op.batch_alter_table("players") as batch_op:
        batch_op.drop_column("position_slot")
        batch_op.drop_column("role")

    with op.batch_alter_table("teams") as batch_op:
        batch_op.drop_column("coach_name")
