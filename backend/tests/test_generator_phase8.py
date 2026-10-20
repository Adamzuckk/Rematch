"""Phase 8 generator: determinism, frames, metrics, scenarios, seed."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import MatchEvent
from app.models.frame import MatchFrame, PlayerFramePosition
from app.models.match import Match
from app.services.seed import seed_phase8_scenario
from app.simulation.generator import (
    GENERATOR_VERSION,
    generate_match_bundle,
    generate_phase8_dataset,
    pitch_distance_m,
    validate_frame_integrity,
    validate_match_bundle,
)
from app.simulation.generator.match_generator import PHASE8_SCENARIO_ID
from app.simulation.generator.metrics import compute_path_metrics
from datetime import datetime, timezone


def test_path_metrics_formula() -> None:
    # Full length of pitch: 100 x-units → 105 m
    assert abs(pitch_distance_m(0, 50, 100, 50) - 105.0) < 1e-6
    m = compute_path_metrics(0, 50, 100, 50, duration_s=5.0)
    assert m.distance_m == 105.0
    assert m.speed_mps == 21.0
    assert m.version == "path_metrics_v1"


def test_generator_deterministic_same_seed() -> None:
    kwargs = dict(
        match_id="m-test-det",
        home_team={"id": "team-a", "name": "Alpha FC", "short_name": "ALF", "slug": "alpha"},
        away_team={"id": "team-b", "name": "Beta United", "short_name": "BET", "slug": "beta"},
        competition="Test League",
        venue="Test Ground",
        kickoff=datetime(2026, 1, 1, 15, 0, tzinfo=timezone.utc),
        target_decision_moments=11,
        scenario="none",
    )
    a = generate_match_bundle("seed-det-1", **kwargs)
    b = generate_match_bundle("seed-det-1", **kwargs)
    assert a.generator_version == GENERATOR_VERSION
    assert [e["id"] for e in a.events] == [e["id"] for e in b.events]
    assert [e["minute"] for e in a.events] == [e["minute"] for e in b.events]
    assert a.match["home_score"] == b.match["home_score"]
    assert len(a.frames) == len(b.frames)
    assert a.frames[0]["players"][0]["x"] == b.frames[0]["players"][0]["x"]


def test_generator_different_seeds_differ() -> None:
    kwargs = dict(
        match_id="m-test-diff",
        home_team={"id": "team-a", "name": "Alpha FC", "short_name": "ALF", "slug": "alpha"},
        away_team={"id": "team-b", "name": "Beta United", "short_name": "BET", "slug": "beta"},
        competition="Test League",
        venue="Test Ground",
        kickoff=datetime(2026, 1, 1, 15, 0, tzinfo=timezone.utc),
        target_decision_moments=11,
    )
    a = generate_match_bundle("seed-A", **kwargs)
    b = generate_match_bundle("seed-B", **kwargs)
    # Event ids are match-scoped sequential; compare geometry instead
    assert a.events[0]["start_x"] != b.events[0]["start_x"] or a.events[0]["start_y"] != b.events[0]["start_y"] or a.match["home_score"] != b.match["home_score"] or len(a.events) != len(b.events) or a.frames[0]["ball_x"] != b.frames[0]["ball_x"]


def test_phase8_dataset_minimums() -> None:
    ds = generate_phase8_dataset()
    assert ds.scenario_id == PHASE8_SCENARIO_ID
    assert len(ds.matches) >= 3
    assert len(ds.bundles) >= 3
    total_eligible = 0
    for bundle in ds.bundles:
        report = validate_match_bundle(bundle, min_eligible=10)
        assert report.ok, report.errors
        total_eligible += len(
            [
                e
                for e in bundle.events
                if e["type"] in ("pass", "shot", "carry")
                and any(f["event_id"] == e["id"] for f in bundle.frames)
            ]
        )
        for fr in bundle.frames:
            fr_report = validate_frame_integrity(fr, require_full_xi=True)
            assert fr_report.ok, fr_report.errors
            assert len(fr["players"]) == 22
            assert fr["ball_x"] is not None
    assert total_eligible >= 30


def test_frame_has_twenty_two_distinct_players() -> None:
    ds = generate_phase8_dataset()
    frame = ds.frames[0]
    ids = [p["player_id"] for p in frame["players"]]
    assert len(ids) == 22
    assert len(set(ids)) == 22


def test_seed_phase8_persists(db_session: Session) -> None:
    result = seed_phase8_scenario(db_session)
    db_session.commit()
    assert result.scenario_id == PHASE8_SCENARIO_ID
    assert result.matches >= 3
    assert result.frames >= 30

    # Every phase8 frame has 22 positions
    frames = list(
        db_session.scalars(
            select(MatchFrame)
            .join(Match, MatchFrame.match_id == Match.id)
            .where(Match.scenario_id == PHASE8_SCENARIO_ID)
        )
    )
    assert len(frames) >= 30
    for fr in frames:
        count = db_session.scalar(
            select(func.count())
            .select_from(PlayerFramePosition)
            .where(PlayerFramePosition.frame_id == fr.id)
        )
        assert count == 22

    # Idempotent
    result2 = seed_phase8_scenario(db_session)
    db_session.commit()
    assert result2.matches == result.matches
    assert result2.frames == result.frames

    # Metrics present on some passes
    passes = list(
        db_session.scalars(
            select(MatchEvent)
            .join(Match, MatchEvent.match_id == Match.id)
            .where(Match.scenario_id == PHASE8_SCENARIO_ID, MatchEvent.type == "pass")
        )
    )
    assert any(p.distance_m is not None and p.ball_speed_mps is not None for p in passes)
