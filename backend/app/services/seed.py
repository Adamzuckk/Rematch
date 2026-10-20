"""Deterministic, idempotent synthetic scenario seeding."""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.session import configure_engine, get_session_factory
from app.models.event import MatchEvent
from app.models.frame import MatchFrame, PlayerFramePosition
from app.models.match import Match
from app.models.player import Player
from app.models.scenario import Scenario
from app.models.team import Team
from app.simulation.coordinates import validate_pitch_point
from app.simulation.generator import (
    generate_phase8_dataset,
    validate_match_bundle,
)
from app.simulation.generator.match_generator import (
    PHASE8_DESCRIPTION,
    PHASE8_SCENARIO_ID,
    PHASE8_SCENARIO_VERSION,
)
from app.simulation.scenario_phase4 import (
    EVENTS,
    FRAMES,
    MATCHES,
    PHASE4_DESCRIPTION,
    PHASE4_PROVENANCE,
    PHASE4_SCENARIO_ID,
    PHASE4_SCENARIO_VERSION,
    PLAYERS,
    TEAMS,
)

PHASE8_PROVENANCE = "synthetic"


@dataclass(frozen=True)
class SeedResult:
    scenario_id: str
    version: str
    teams: int
    players: int
    matches: int
    events: int
    frames: int
    created_new: bool


def _upsert_scenario(db: Session) -> tuple[Scenario, bool]:
    existing = db.get(Scenario, PHASE4_SCENARIO_ID)
    if existing is None:
        scenario = Scenario(
            id=PHASE4_SCENARIO_ID,
            version=PHASE4_SCENARIO_VERSION,
            description=PHASE4_DESCRIPTION,
            provenance=PHASE4_PROVENANCE,
        )
        db.add(scenario)
        return scenario, True

    existing.version = PHASE4_SCENARIO_VERSION
    existing.description = PHASE4_DESCRIPTION
    existing.provenance = PHASE4_PROVENANCE
    return existing, False


def _upsert_teams(db: Session) -> None:
    for row in TEAMS:
        team = db.get(Team, row["id"])
        if team is None:
            db.add(
                Team(
                    id=row["id"],
                    name=row["name"],
                    short_name=row["short_name"],
                    provenance=PHASE4_PROVENANCE,
                )
            )
        else:
            team.name = row["name"]
            team.short_name = row["short_name"]
            team.provenance = PHASE4_PROVENANCE


def _upsert_players(db: Session) -> None:
    for row in PLAYERS:
        player = db.get(Player, row["id"])
        if player is None:
            db.add(
                Player(
                    id=row["id"],
                    team_id=row["team_id"],
                    name=row["name"],
                    shirt_number=row["shirt_number"],
                    provenance=PHASE4_PROVENANCE,
                )
            )
        else:
            player.team_id = row["team_id"]
            player.name = row["name"]
            player.shirt_number = row["shirt_number"]
            player.provenance = PHASE4_PROVENANCE


def _upsert_matches(db: Session) -> None:
    for row in MATCHES:
        match = db.get(Match, row["id"])
        values = {
            "scenario_id": PHASE4_SCENARIO_ID,
            "competition": row["competition"],
            "home_team_id": row["home_team_id"],
            "away_team_id": row["away_team_id"],
            "status": row["status"],
            "kickoff_at": row["kickoff_at"],
            "home_score": row.get("home_score"),
            "away_score": row.get("away_score"),
            "minute": row.get("minute"),
            "venue": row.get("venue"),
            "provenance": PHASE4_PROVENANCE,
        }
        if match is None:
            db.add(Match(id=row["id"], **values))
        else:
            for key, value in values.items():
                setattr(match, key, value)


def _validate_event_coords(row: dict) -> None:
    validate_pitch_point(row.get("start_x"), row.get("start_y"), label=f"{row['id']}.start")
    validate_pitch_point(row.get("end_x"), row.get("end_y"), label=f"{row['id']}.end")
    validate_pitch_point(
        row.get("location_x"),
        row.get("location_y"),
        label=f"{row['id']}.location",
    )


def _upsert_events(db: Session) -> None:
    for row in EVENTS:
        _validate_event_coords(row)
        event = db.get(MatchEvent, row["id"])
        values = {
            "match_id": row["match_id"],
            "type": row["type"],
            "minute": row.get("minute"),
            "occurred_at": row.get("occurred_at"),
            "team_id": row.get("team_id"),
            "player_id": row.get("player_id"),
            "receiver_id": row.get("receiver_id"),
            "start_x": row.get("start_x"),
            "start_y": row.get("start_y"),
            "end_x": row.get("end_x"),
            "end_y": row.get("end_y"),
            "location_x": row.get("location_x"),
            "location_y": row.get("location_y"),
            "outcome": row.get("outcome"),
            "gained_by_team_id": row.get("gained_by_team_id"),
            "provenance": PHASE4_PROVENANCE,
        }
        if event is None:
            db.add(MatchEvent(id=row["id"], **values))
        else:
            for key, value in values.items():
                setattr(event, key, value)


def _upsert_frames(db: Session) -> None:
    for row in FRAMES:
        validate_pitch_point(row.get("ball_x"), row.get("ball_y"), label=f"{row['id']}.ball")
        for pos in row["players"]:
            validate_pitch_point(pos["x"], pos["y"], label=f"{pos['id']}.position")

        frame = db.get(MatchFrame, row["id"])
        values = {
            "match_id": row["match_id"],
            "event_id": row.get("event_id"),
            "minute": row.get("minute"),
            "occurred_at": row.get("occurred_at"),
            "ball_x": row.get("ball_x"),
            "ball_y": row.get("ball_y"),
            "provenance": PHASE4_PROVENANCE,
        }
        if frame is None:
            db.add(MatchFrame(id=row["id"], **values))
        else:
            for key, value in values.items():
                setattr(frame, key, value)

        # Deterministic replace: stable position IDs, no duplicates on re-seed.
        db.execute(
            delete(PlayerFramePosition).where(PlayerFramePosition.frame_id == row["id"])
        )
        db.flush()
        for pos in row["players"]:
            db.add(
                PlayerFramePosition(
                    id=pos["id"],
                    frame_id=row["id"],
                    player_id=pos["player_id"],
                    team_id=pos["team_id"],
                    x=pos["x"],
                    y=pos["y"],
                )
            )


def seed_phase4_scenario(db: Session) -> SeedResult:
    """Seed rematch-phase4-v1 inside an open session (caller owns commit)."""
    _, created_new = _upsert_scenario(db)
    _upsert_teams(db)
    db.flush()
    _upsert_players(db)
    db.flush()
    _upsert_matches(db)
    db.flush()
    _upsert_events(db)
    db.flush()
    _upsert_frames(db)
    db.flush()

    return SeedResult(
        scenario_id=PHASE4_SCENARIO_ID,
        version=PHASE4_SCENARIO_VERSION,
        teams=db.scalar(select(func.count()).select_from(Team)) or 0,
        players=db.scalar(select(func.count()).select_from(Player)) or 0,
        matches=db.scalar(
            select(func.count())
            .select_from(Match)
            .where(Match.scenario_id == PHASE4_SCENARIO_ID)
        )
        or 0,
        events=db.scalar(select(func.count()).select_from(MatchEvent)) or 0,
        frames=db.scalar(select(func.count()).select_from(MatchFrame)) or 0,
        created_new=created_new,
    )


def seed_phase8_scenario(db: Session) -> SeedResult:
    """Generate and upsert rematch-phase8-v1 (full XI + decision frames)."""
    dataset = generate_phase8_dataset()
    for bundle in dataset.bundles:
        report = validate_match_bundle(bundle, min_eligible=10)
        if not report.ok:
            raise ValueError(
                f"Phase 8 bundle {bundle.match['id']} failed validation: {report.errors}"
            )

    scenario = db.get(Scenario, PHASE8_SCENARIO_ID)
    created_new = scenario is None
    if scenario is None:
        db.add(
            Scenario(
                id=PHASE8_SCENARIO_ID,
                version=PHASE8_SCENARIO_VERSION,
                description=PHASE8_DESCRIPTION,
                provenance=PHASE8_PROVENANCE,
            )
        )
    else:
        scenario.version = PHASE8_SCENARIO_VERSION
        scenario.description = PHASE8_DESCRIPTION
        scenario.provenance = PHASE8_PROVENANCE
    db.flush()

    for row in dataset.teams:
        team = db.get(Team, row["id"])
        if team is None:
            db.add(
                Team(
                    id=row["id"],
                    name=row["name"],
                    short_name=row["short_name"],
                    provenance=PHASE8_PROVENANCE,
                )
            )
        else:
            team.name = row["name"]
            team.short_name = row["short_name"]
            team.provenance = PHASE8_PROVENANCE
    db.flush()

    for row in dataset.players:
        player = db.get(Player, row["id"])
        if player is None:
            db.add(
                Player(
                    id=row["id"],
                    team_id=row["team_id"],
                    name=row["name"],
                    shirt_number=row["shirt_number"],
                    provenance=PHASE8_PROVENANCE,
                )
            )
        else:
            player.team_id = row["team_id"]
            player.name = row["name"]
            player.shirt_number = row["shirt_number"]
            player.provenance = PHASE8_PROVENANCE
    db.flush()

    for row in dataset.matches:
        match = db.get(Match, row["id"])
        values = {
            "scenario_id": PHASE8_SCENARIO_ID,
            "competition": row["competition"],
            "home_team_id": row["home_team_id"],
            "away_team_id": row["away_team_id"],
            "status": row["status"],
            "kickoff_at": row["kickoff_at"],
            "home_score": row.get("home_score"),
            "away_score": row.get("away_score"),
            "minute": row.get("minute"),
            "venue": row.get("venue"),
            "provenance": PHASE8_PROVENANCE,
        }
        if match is None:
            db.add(Match(id=row["id"], **values))
        else:
            for key, value in values.items():
                setattr(match, key, value)
    db.flush()

    for row in dataset.events:
        validate_pitch_point(row.get("start_x"), row.get("start_y"), label=f"{row['id']}.start")
        validate_pitch_point(row.get("end_x"), row.get("end_y"), label=f"{row['id']}.end")
        validate_pitch_point(
            row.get("location_x"),
            row.get("location_y"),
            label=f"{row['id']}.location",
        )
        event = db.get(MatchEvent, row["id"])
        values = {
            "match_id": row["match_id"],
            "type": row["type"],
            "minute": row.get("minute"),
            "occurred_at": row.get("occurred_at"),
            "team_id": row.get("team_id"),
            "player_id": row.get("player_id"),
            "receiver_id": row.get("receiver_id"),
            "start_x": row.get("start_x"),
            "start_y": row.get("start_y"),
            "end_x": row.get("end_x"),
            "end_y": row.get("end_y"),
            "location_x": row.get("location_x"),
            "location_y": row.get("location_y"),
            "outcome": row.get("outcome"),
            "gained_by_team_id": row.get("gained_by_team_id"),
            "distance_m": row.get("distance_m"),
            "duration_s": row.get("duration_s"),
            "ball_speed_mps": row.get("ball_speed_mps"),
            "shot_speed_mps": row.get("shot_speed_mps"),
            "provenance": PHASE8_PROVENANCE,
        }
        if event is None:
            db.add(MatchEvent(id=row["id"], **values))
        else:
            for key, value in values.items():
                setattr(event, key, value)
    db.flush()

    for row in dataset.frames:
        validate_pitch_point(row.get("ball_x"), row.get("ball_y"), label=f"{row['id']}.ball")
        for pos in row["players"]:
            validate_pitch_point(pos["x"], pos["y"], label=f"{pos['id']}.position")
        frame = db.get(MatchFrame, row["id"])
        values = {
            "match_id": row["match_id"],
            "event_id": row.get("event_id"),
            "minute": row.get("minute"),
            "occurred_at": row.get("occurred_at"),
            "ball_x": row.get("ball_x"),
            "ball_y": row.get("ball_y"),
            "provenance": PHASE8_PROVENANCE,
        }
        if frame is None:
            db.add(MatchFrame(id=row["id"], **values))
        else:
            for key, value in values.items():
                setattr(frame, key, value)
        db.execute(
            delete(PlayerFramePosition).where(PlayerFramePosition.frame_id == row["id"])
        )
        db.flush()
        for pos in row["players"]:
            db.add(
                PlayerFramePosition(
                    id=pos["id"],
                    frame_id=row["id"],
                    player_id=pos["player_id"],
                    team_id=pos["team_id"],
                    x=pos["x"],
                    y=pos["y"],
                )
            )
    db.flush()

    return SeedResult(
        scenario_id=PHASE8_SCENARIO_ID,
        version=PHASE8_SCENARIO_VERSION,
        teams=db.scalar(select(func.count()).select_from(Team)) or 0,
        players=db.scalar(select(func.count()).select_from(Player)) or 0,
        matches=db.scalar(
            select(func.count())
            .select_from(Match)
            .where(Match.scenario_id == PHASE8_SCENARIO_ID)
        )
        or 0,
        events=db.scalar(
            select(func.count())
            .select_from(MatchEvent)
            .join(Match, MatchEvent.match_id == Match.id)
            .where(Match.scenario_id == PHASE8_SCENARIO_ID)
        )
        or 0,
        frames=db.scalar(
            select(func.count())
            .select_from(MatchFrame)
            .join(Match, MatchFrame.match_id == Match.id)
            .where(Match.scenario_id == PHASE8_SCENARIO_ID)
        )
        or 0,
        created_new=created_new,
    )


def run_seed() -> list[SeedResult]:
    """Configure engine and seed Phase 4 + Phase 8 scenarios."""
    configure_engine()
    session_factory = get_session_factory()
    with session_factory() as db:
        try:
            r4 = seed_phase4_scenario(db)
            r8 = seed_phase8_scenario(db)
            db.commit()
            return [r4, r8]
        except Exception:
            db.rollback()
            raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed ReMatch synthetic scenario data.")
    parser.parse_args(argv)
    results = run_seed()
    for result in results:
        print(
            f"Seeded scenario {result.scenario_id} v{result.version} "
            f"(teams={result.teams}, players={result.players}, matches={result.matches}, "
            f"events={result.events}, frames={result.frames}, created_new={result.created_new})"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
