from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.event import MatchEvent
from app.models.frame import MatchFrame, PlayerFramePosition
from app.models.match import Match
from app.models.player import Player
from app.models.scenario import Scenario
from app.models.team import Team, TeamFormResult
from app.services.seed import seed_phase4_scenario
from app.simulation.coordinates import InvalidPitchCoordinateError, validate_pitch_point
from app.simulation.rich_catalogue import (
    RICH_SCENARIO_ID,
    RICH_SCENARIO_VERSION,
    generate_rich_catalogue,
)

SEED_NOW = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)


def test_seed_deterministic_counts(db_session: Session) -> None:
    catalogue = generate_rich_catalogue(now=SEED_NOW)
    first = seed_phase4_scenario(db_session, now=SEED_NOW)
    db_session.commit()
    assert first.scenario_id == RICH_SCENARIO_ID
    assert first.version == RICH_SCENARIO_VERSION
    assert first.teams == len(catalogue.teams)
    assert first.players == len(catalogue.players)
    assert first.matches == 6
    assert first.events == len(catalogue.events)
    assert first.frames == len(catalogue.frames)
    assert first.form_results == len(catalogue.form_results)
    assert first.created_new is True


def test_seed_idempotent(db_session: Session) -> None:
    catalogue = generate_rich_catalogue(now=SEED_NOW)
    seed_phase4_scenario(db_session, now=SEED_NOW)
    db_session.commit()
    second = seed_phase4_scenario(db_session, now=SEED_NOW)
    db_session.commit()

    assert second.created_new is False
    assert db_session.scalar(select(func.count()).select_from(Team)) == len(catalogue.teams)
    assert db_session.scalar(select(func.count()).select_from(Player)) == len(
        catalogue.players
    )
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(Match)
            .where(Match.scenario_id == RICH_SCENARIO_ID)
        )
        == 6
    )
    assert db_session.scalar(select(func.count()).select_from(MatchEvent)) == len(
        catalogue.events
    )
    assert db_session.scalar(select(func.count()).select_from(MatchFrame)) == len(
        catalogue.frames
    )
    assert db_session.scalar(select(func.count()).select_from(TeamFormResult)) == len(
        catalogue.form_results
    )


def test_seed_six_match_mix(seeded_db: Session) -> None:
    rows = list(
        seeded_db.scalars(
            select(Match).where(Match.scenario_id == RICH_SCENARIO_ID)
        ).all()
    )
    assert len(rows) == 6
    by_status = {}
    for match in rows:
        by_status.setdefault(match.status, []).append(match.id)
    assert len(by_status["live"]) == 3
    assert len(by_status["finished"]) == 2
    assert by_status["upcoming"] == ["m-lakeside-ironford-2405"]
    assert all(m.home_team.coach_name for m in rows)
    assert all(
        seeded_db.scalar(
            select(func.count())
            .select_from(TeamFormResult)
            .where(TeamFormResult.team_id == team_id)
        )
        == 5
        for team_id in {m.home_team_id for m in rows} | {m.away_team_id for m in rows}
    )


def test_seed_foreign_keys(seeded_db: Session) -> None:
    scenario = seeded_db.get(Scenario, RICH_SCENARIO_ID)
    assert scenario is not None

    for match in seeded_db.scalars(select(Match)).all():
        assert match.scenario_id == RICH_SCENARIO_ID
        assert seeded_db.get(Team, match.home_team_id) is not None
        assert seeded_db.get(Team, match.away_team_id) is not None

    for event in seeded_db.scalars(select(MatchEvent)).all():
        assert seeded_db.get(Match, event.match_id) is not None
        if event.player_id:
            assert seeded_db.get(Player, event.player_id) is not None
        if event.team_id:
            assert seeded_db.get(Team, event.team_id) is not None
        if event.assist_player_id:
            assert seeded_db.get(Player, event.assist_player_id) is not None

    for frame in seeded_db.scalars(select(MatchFrame)).all():
        assert seeded_db.get(Match, frame.match_id) is not None
        if frame.event_id:
            assert seeded_db.get(MatchEvent, frame.event_id) is not None
        for pos in frame.players:
            assert seeded_db.get(Player, pos.player_id) is not None
            assert seeded_db.get(Team, pos.team_id) is not None


def test_seed_provenance_synthetic(seeded_db: Session) -> None:
    assert seeded_db.get(Scenario, RICH_SCENARIO_ID).provenance == "synthetic"
    assert all(t.provenance == "synthetic" for t in seeded_db.scalars(select(Team)))
    assert all(m.provenance == "synthetic" for m in seeded_db.scalars(select(Match)))
    assert all(e.provenance == "synthetic" for e in seeded_db.scalars(select(MatchEvent)))
    assert all(f.provenance == "synthetic" for f in seeded_db.scalars(select(MatchFrame)))


def test_decision_fixture_events_present(seeded_db: Session) -> None:
    for event_id in (
        "evt-ng-pass-12",
        "evt-ng-carry-64",
        "evt-ng-shot-23",
        "evt-ng-possession-52",
        "evt-oak-pass-18",
    ):
        assert seeded_db.get(MatchEvent, event_id) is not None
    assert seeded_db.get(MatchFrame, "frm-ng-12") is not None
    assert seeded_db.get(MatchFrame, "frm-ng-64") is not None


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
