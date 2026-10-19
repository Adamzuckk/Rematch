from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.event import MatchEvent
from app.models.frame import MatchFrame, PlayerFramePosition
from app.models.match import Match
from app.models.player import Player
from app.models.scenario import Scenario
from app.models.team import Team
from app.services.seed import seed_phase4_scenario
from app.simulation.coordinates import InvalidPitchCoordinateError, validate_pitch_point
from app.simulation.scenario_phase4 import (
    EVENTS,
    FRAMES,
    MATCHES,
    PHASE4_SCENARIO_ID,
    PHASE4_SCENARIO_VERSION,
    PLAYERS,
    TEAMS,
)


def test_seed_deterministic_counts(db_session: Session) -> None:
    first = seed_phase4_scenario(db_session)
    db_session.commit()
    assert first.scenario_id == PHASE4_SCENARIO_ID
    assert first.version == PHASE4_SCENARIO_VERSION
    assert first.teams == len(TEAMS)
    assert first.players == len(PLAYERS)
    assert first.matches == len(MATCHES)
    assert first.events == len(EVENTS)
    assert first.frames == len(FRAMES)
    assert first.created_new is True


def test_seed_idempotent(db_session: Session) -> None:
    seed_phase4_scenario(db_session)
    db_session.commit()
    second = seed_phase4_scenario(db_session)
    db_session.commit()

    assert second.created_new is False
    assert db_session.scalar(select(func.count()).select_from(Team)) == len(TEAMS)
    assert db_session.scalar(select(func.count()).select_from(Player)) == len(PLAYERS)
    assert db_session.scalar(select(func.count()).select_from(Match)) == len(MATCHES)
    assert db_session.scalar(select(func.count()).select_from(MatchEvent)) == len(EVENTS)
    assert db_session.scalar(select(func.count()).select_from(MatchFrame)) == len(FRAMES)
    positions = db_session.scalar(select(func.count()).select_from(PlayerFramePosition))
    expected_positions = sum(len(frame["players"]) for frame in FRAMES)
    assert positions == expected_positions


def test_seed_foreign_keys(seeded_db: Session) -> None:
    scenario = seeded_db.get(Scenario, PHASE4_SCENARIO_ID)
    assert scenario is not None

    for match in seeded_db.scalars(select(Match)).all():
        assert match.scenario_id == PHASE4_SCENARIO_ID
        assert seeded_db.get(Team, match.home_team_id) is not None
        assert seeded_db.get(Team, match.away_team_id) is not None

    for event in seeded_db.scalars(select(MatchEvent)).all():
        assert seeded_db.get(Match, event.match_id) is not None
        if event.player_id:
            assert seeded_db.get(Player, event.player_id) is not None
        if event.team_id:
            assert seeded_db.get(Team, event.team_id) is not None

    for frame in seeded_db.scalars(select(MatchFrame)).all():
        assert seeded_db.get(Match, frame.match_id) is not None
        if frame.event_id:
            assert seeded_db.get(MatchEvent, frame.event_id) is not None
        for pos in frame.players:
            assert seeded_db.get(Player, pos.player_id) is not None
            assert seeded_db.get(Team, pos.team_id) is not None


def test_seed_provenance_synthetic(seeded_db: Session) -> None:
    assert seeded_db.get(Scenario, PHASE4_SCENARIO_ID).provenance == "synthetic"
    assert all(t.provenance == "synthetic" for t in seeded_db.scalars(select(Team)))
    assert all(m.provenance == "synthetic" for m in seeded_db.scalars(select(Match)))
    assert all(e.provenance == "synthetic" for e in seeded_db.scalars(select(MatchEvent)))
    assert all(f.provenance == "synthetic" for f in seeded_db.scalars(select(MatchFrame)))


def test_invalid_coordinate_rejected() -> None:
    with pytest.raises(InvalidPitchCoordinateError):
        validate_pitch_point(120, 50, label="out_of_range")
    with pytest.raises(InvalidPitchCoordinateError):
        validate_pitch_point(-1, 10, label="negative")
    with pytest.raises(InvalidPitchCoordinateError):
        validate_pitch_point(50, None, label="partial")


def test_db_rejects_invalid_event_coordinates(seeded_db: Session) -> None:
    bad = MatchEvent(
        id="evt-bad-coords",
        match_id="m-northgate-riverside-2401",
        type="shot",
        location_x=150,
        location_y=50,
        provenance="synthetic",
    )
    seeded_db.add(bad)
    with pytest.raises(IntegrityError):
        seeded_db.flush()
    seeded_db.rollback()


def test_db_rejects_orphan_player(seeded_db: Session) -> None:
    orphan = Player(
        id="player-orphan",
        team_id="team-does-not-exist",
        name="Ghost",
        provenance="synthetic",
    )
    seeded_db.add(orphan)
    with pytest.raises(IntegrityError):
        seeded_db.flush()
    seeded_db.rollback()
