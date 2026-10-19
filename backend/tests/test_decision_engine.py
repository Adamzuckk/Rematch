"""Decision engine integration tests against seeded + controlled fixtures."""

from __future__ import annotations

import math

import pytest
from sqlalchemy.orm import Session

from app.models.event import MatchEvent
from app.services.decision.engine import (
    EventNotFoundError,
    InsufficientEvidenceError,
    MatchNotFoundError,
    analyze_decision,
)
from app.services.decision.scoring import score_path_action
from app.services.decision.geometry import Point


NORTHGATE = "m-northgate-riverside-2401"
OAKWOOD = "m-oakwood-silvermere-2403"


def test_analyze_seeded_pass_with_frame(seeded_db: Session) -> None:
    result = analyze_decision(seeded_db, NORTHGATE, "evt-ng-pass-12")
    assert result.event_type == "pass"
    assert result.player_id == "player-northgate-8"
    assert result.team_id == "team-northgate"
    assert result.is_home_team is True
    assert result.provenance == "synthetic"
    assert result.observed.composite_score is not None
    assert math.isclose(result.observed.composite_score, 30.353_813_178_5, rel_tol=1e-9)
    # Frame has only the receiver as other Northgate teammate → no alternatives.
    assert result.alternatives == []
    assert result.completeness.has_aligned_frame is True
    assert result.completeness.level == "partial"
    assert result.confidence == "medium"
    assert result.context["frameId"] == "frm-ng-12"

    statuses = {c.id: c.status for c in result.claims}
    assert statuses[f"claim-observed-score:evt-ng-pass-12"] == "verified"
    assert statuses[f"claim-exhaustive-alternatives:evt-ng-pass-12"] == "partially_supported"


def test_analyze_seeded_carry_with_alternative(seeded_db: Session) -> None:
    result = analyze_decision(seeded_db, NORTHGATE, "evt-ng-carry-64")
    assert result.event_type == "carry"
    assert len(result.alternatives) == 1
    alt = result.alternatives[0]
    assert alt.target_player_id == "player-northgate-9"
    assert alt.composite_score is not None
    assert result.observed.composite_score is not None
    assert alt.composite_score > result.observed.composite_score

    # Ranking: alternative first, observed second
    by_id = {row["actionId"]: row for row in result.ranking}
    assert by_id[alt.action_id]["rank"] == 1
    assert by_id[result.observed.action_id]["rank"] == 2
    assert result.completeness.level == "complete"
    assert result.confidence == "high"

    ranking_claim = next(c for c in result.claims if c.id.startswith("claim-ranking:"))
    assert ranking_claim.status == "verified"


def test_analyze_seeded_shot(seeded_db: Session) -> None:
    result = analyze_decision(seeded_db, NORTHGATE, "evt-ng-shot-23")
    assert result.event_type == "shot"
    assert result.observed.composite_score is not None
    # ng8 is a teammate alternative from the shot location
    assert any(a.target_player_id == "player-northgate-8" for a in result.alternatives)


def test_oakwood_pass_no_frame(seeded_db: Session) -> None:
    result = analyze_decision(seeded_db, OAKWOOD, "evt-oak-pass-18")
    assert result.alternatives == []
    assert result.completeness.has_aligned_frame is False
    assert result.completeness.level == "partial"
    assert result.confidence == "low"
    statuses = {c.status for c in result.claims}
    assert "unsupported" in statuses  # passing-lanes claim
    assert "verified" in statuses


def test_match_not_found(seeded_db: Session) -> None:
    with pytest.raises(MatchNotFoundError):
        analyze_decision(seeded_db, "missing-match", "evt-ng-pass-12")


def test_event_not_found(seeded_db: Session) -> None:
    with pytest.raises(EventNotFoundError):
        analyze_decision(seeded_db, NORTHGATE, "evt-missing")


def test_event_wrong_match(seeded_db: Session) -> None:
    with pytest.raises(EventNotFoundError):
        analyze_decision(seeded_db, NORTHGATE, "evt-oak-pass-18")


def test_insufficient_possession_change(seeded_db: Session) -> None:
    with pytest.raises(InsufficientEvidenceError) as exc:
        analyze_decision(seeded_db, NORTHGATE, "evt-ng-possession-52")
    assert "not a decision candidate" in exc.value.reason


def test_insufficient_pressure(seeded_db: Session) -> None:
    with pytest.raises(InsufficientEvidenceError):
        analyze_decision(seeded_db, NORTHGATE, "evt-ng-pressure-41")


def test_insufficient_missing_coordinates(seeded_db: Session) -> None:
    event = MatchEvent(
        id="evt-ng-pass-nocoords",
        match_id=NORTHGATE,
        type="pass",
        minute=70,
        team_id="team-northgate",
        player_id="player-northgate-8",
        provenance="synthetic",
    )
    seeded_db.add(event)
    seeded_db.commit()

    with pytest.raises(InsufficientEvidenceError) as exc:
        analyze_decision(seeded_db, NORTHGATE, "evt-ng-pass-nocoords")
    assert "coordinates" in exc.value.reason.lower()


def test_evidence_refs_belong_to_match(seeded_db: Session) -> None:
    result = analyze_decision(seeded_db, NORTHGATE, "evt-ng-carry-64")
    for claim in result.claims:
        for ref in claim.evidence:
            assert ref.match_id == NORTHGATE
            if ref.kind == "event":
                assert ref.id in result.evidence_catalog.event_ids
            if ref.kind == "frame":
                assert ref.id in result.evidence_catalog.frame_ids
            if ref.kind == "calculation":
                assert ref.id in result.evidence_catalog.calculation_ids


def test_no_fabricated_scores_without_coords(seeded_db: Session) -> None:
    """Engine must not invent composites for non-analyzable events."""
    with pytest.raises(InsufficientEvidenceError):
        analyze_decision(seeded_db, NORTHGATE, "evt-ng-possession-52")


def test_repeatable_analysis(seeded_db: Session) -> None:
    a = analyze_decision(seeded_db, NORTHGATE, "evt-ng-carry-64")
    b = analyze_decision(seeded_db, NORTHGATE, "evt-ng-carry-64")
    assert a.observed.composite_score == b.observed.composite_score
    assert [x.composite_score for x in a.alternatives] == [
        x.composite_score for x in b.alternatives
    ]
    assert [c.status for c in a.claims] == [c.status for c in b.claims]


def test_controlled_fixture_matches_pure_scorer(seeded_db: Session) -> None:
    result = analyze_decision(seeded_db, NORTHGATE, "evt-ng-pass-12")
    pure = score_path_action(
        action_id="observed:evt-ng-pass-12",
        kind="observed_pass",
        label="Observed pass",
        start=Point(42.0, 48.0),
        end=Point(58.0, 62.0),
        is_home=True,
        target_player_id="player-northgate-11",
    )
    assert result.observed.composite_score == pure.composite_score
