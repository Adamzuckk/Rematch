"""Initial Phase 4 schema: scenarios, teams, players, matches, events, frames.

Revision ID: 20261019_0001
Revises:
Create Date: 2026-10-19 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261019_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scenarios",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("version", sa.String(length=32), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("provenance", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )

    op.create_table(
        "teams",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("short_name", sa.String(length=16)),
        sa.Column("provenance", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint("name", name="uq_teams_name"),
    )

    op.create_table(
        "players",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("shirt_number", sa.Integer()),
        sa.Column("provenance", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("team_id", "shirt_number", name="uq_players_team_shirt"),
    )
    op.create_index("ix_players_team_id", "players", ["team_id"])

    op.create_table(
        "matches",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("scenario_id", sa.String(length=64), nullable=False),
        sa.Column("competition", sa.String(length=128), nullable=False),
        sa.Column("home_team_id", sa.String(length=64), nullable=False),
        sa.Column("away_team_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("kickoff_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("home_score", sa.Integer()),
        sa.Column("away_score", sa.Integer()),
        sa.Column("minute", sa.Integer()),
        sa.Column("venue", sa.String(length=128)),
        sa.Column("provenance", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["scenario_id"], ["scenarios.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["home_team_id"], ["teams.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["away_team_id"], ["teams.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("home_team_id <> away_team_id", name="ck_matches_distinct_teams"),
        sa.CheckConstraint(
            "status IN ('live', 'finished', 'upcoming')",
            name="ck_matches_status",
        ),
        sa.CheckConstraint(
            "home_score IS NULL OR home_score >= 0",
            name="ck_matches_home_score",
        ),
        sa.CheckConstraint(
            "away_score IS NULL OR away_score >= 0",
            name="ck_matches_away_score",
        ),
        sa.CheckConstraint(
            "minute IS NULL OR (minute >= 0 AND minute <= 150)",
            name="ck_matches_minute",
        ),
        sa.UniqueConstraint(
            "scenario_id",
            "home_team_id",
            "away_team_id",
            "kickoff_at",
            name="uq_matches_scenario_fixture",
        ),
    )
    op.create_index("ix_matches_scenario_id", "matches", ["scenario_id"])
    op.create_index("ix_matches_competition", "matches", ["competition"])
    op.create_index("ix_matches_home_team_id", "matches", ["home_team_id"])
    op.create_index("ix_matches_away_team_id", "matches", ["away_team_id"])
    op.create_index("ix_matches_status", "matches", ["status"])

    op.create_table(
        "match_events",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("match_id", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("minute", sa.Float()),
        sa.Column("occurred_at", sa.DateTime(timezone=True)),
        sa.Column("team_id", sa.String(length=64)),
        sa.Column("player_id", sa.String(length=64)),
        sa.Column("receiver_id", sa.String(length=64)),
        sa.Column("start_x", sa.Float()),
        sa.Column("start_y", sa.Float()),
        sa.Column("end_x", sa.Float()),
        sa.Column("end_y", sa.Float()),
        sa.Column("location_x", sa.Float()),
        sa.Column("location_y", sa.Float()),
        sa.Column("outcome", sa.String(length=32)),
        sa.Column("gained_by_team_id", sa.String(length=64)),
        sa.Column("provenance", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["receiver_id"], ["players.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["gained_by_team_id"], ["teams.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "type IN ('pass', 'shot', 'carry', 'tackle', 'pressure', 'possession_change')",
            name="ck_match_events_type",
        ),
        sa.CheckConstraint("minute IS NULL OR minute >= 0", name="ck_match_events_minute"),
        sa.CheckConstraint(
            "(start_x IS NULL AND start_y IS NULL) OR "
            "(start_x IS NOT NULL AND start_y IS NOT NULL AND "
            "start_x >= 0 AND start_x <= 100 AND start_y >= 0 AND start_y <= 100)",
            name="ck_match_events_start_xy",
        ),
        sa.CheckConstraint(
            "(end_x IS NULL AND end_y IS NULL) OR "
            "(end_x IS NOT NULL AND end_y IS NOT NULL AND "
            "end_x >= 0 AND end_x <= 100 AND end_y >= 0 AND end_y <= 100)",
            name="ck_match_events_end_xy",
        ),
        sa.CheckConstraint(
            "(location_x IS NULL AND location_y IS NULL) OR "
            "(location_x IS NOT NULL AND location_y IS NOT NULL AND "
            "location_x >= 0 AND location_x <= 100 AND "
            "location_y >= 0 AND location_y <= 100)",
            name="ck_match_events_location_xy",
        ),
    )
    op.create_index("ix_match_events_match_id", "match_events", ["match_id"])
    op.create_index("ix_match_events_type", "match_events", ["type"])
    op.create_index("ix_match_events_team_id", "match_events", ["team_id"])
    op.create_index("ix_match_events_player_id", "match_events", ["player_id"])

    op.create_table(
        "match_frames",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("match_id", sa.String(length=64), nullable=False),
        sa.Column("event_id", sa.String(length=64)),
        sa.Column("minute", sa.Integer()),
        sa.Column("occurred_at", sa.DateTime(timezone=True)),
        sa.Column("ball_x", sa.Float()),
        sa.Column("ball_y", sa.Float()),
        sa.Column("provenance", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["match_events.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "(ball_x IS NULL AND ball_y IS NULL) OR "
            "(ball_x IS NOT NULL AND ball_y IS NOT NULL AND "
            "ball_x >= 0 AND ball_x <= 100 AND ball_y >= 0 AND ball_y <= 100)",
            name="ck_match_frames_ball_xy",
        ),
        sa.CheckConstraint("minute IS NULL OR minute >= 0", name="ck_match_frames_minute"),
    )
    op.create_index("ix_match_frames_match_id", "match_frames", ["match_id"])
    op.create_index("ix_match_frames_event_id", "match_frames", ["event_id"])

    op.create_table(
        "player_frame_positions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("frame_id", sa.String(length=64), nullable=False),
        sa.Column("player_id", sa.String(length=64), nullable=False),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["frame_id"], ["match_frames.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("frame_id", "player_id", name="uq_player_frame_positions"),
        sa.CheckConstraint(
            "x >= 0 AND x <= 100 AND y >= 0 AND y <= 100",
            name="ck_player_frame_positions_xy",
        ),
    )
    op.create_index(
        "ix_player_frame_positions_frame_id",
        "player_frame_positions",
        ["frame_id"],
    )
    op.create_index(
        "ix_player_frame_positions_player_id",
        "player_frame_positions",
        ["player_id"],
    )
    op.create_index(
        "ix_player_frame_positions_team_id",
        "player_frame_positions",
        ["team_id"],
    )


def downgrade() -> None:
    op.drop_table("player_frame_positions")
    op.drop_table("match_frames")
    op.drop_table("match_events")
    op.drop_table("matches")
    op.drop_table("players")
    op.drop_table("teams")
    op.drop_table("scenarios")
