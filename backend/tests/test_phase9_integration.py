"""Phase 9 integration checks for the seeded Phase 8 match journey."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.deps import get_db_dep
from app.main import create_app
from app.services.seed import seed_phase8_scenario
from app.simulation.generator.match_generator import PHASE8_SCENARIO_ID


@pytest.fixture()
def phase8_client(db_session: Session) -> Generator[TestClient, None, None]:
    seed_phase8_scenario(db_session)
    db_session.commit()

    app = create_app()

    def override_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db_dep] = override_db
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


def test_phase8_catalog_to_evidence_backed_decision_journey(
    phase8_client: TestClient,
) -> None:
    """Walk the same API contract used by the dashboard and explorer."""
    dataset_response = phase8_client.get("/api/v1/matches/dataset")
    assert dataset_response.status_code == 200
    dataset = dataset_response.json()
    assert dataset["scenarioId"] == PHASE8_SCENARIO_ID
    assert dataset["provenance"] == "synthetic"
    assert dataset["matchCount"] == 3

    catalogue_response = phase8_client.get("/api/v1/matches")
    assert catalogue_response.status_code == 200
    catalogue = catalogue_response.json()
    phase8_matches = [
        row for row in catalogue["items"] if row["scenarioId"] == PHASE8_SCENARIO_ID
    ]
    assert len(phase8_matches) == dataset["matchCount"]

    match = phase8_matches[0]
    match_id = match["id"]
    detail_response = phase8_client.get(f"/api/v1/matches/{match_id}")
    assert detail_response.status_code == 200
    assert detail_response.json() == match

    events = phase8_client.get(f"/api/v1/matches/{match_id}/events").json()["items"]
    frames = phase8_client.get(f"/api/v1/matches/{match_id}/frames").json()["items"]
    players = phase8_client.get(f"/api/v1/matches/{match_id}/players").json()
    assert events
    assert len(players) == 22

    eligible_types = {"pass", "shot", "carry"}
    event_by_id = {event["id"]: event for event in events}
    aligned_frame = next(
        frame
        for frame in frames
        if frame["eventId"] in event_by_id
        and event_by_id[frame["eventId"]]["type"] in eligible_types
    )
    event_id = aligned_frame["eventId"]
    assert len(aligned_frame["players"]) == 22

    analysis_response = phase8_client.get(
        f"/api/v1/matches/{match_id}/events/{event_id}/decision-analysis"
    )
    assert analysis_response.status_code == 200
    analysis = analysis_response.json()
    assert analysis["matchId"] == match_id
    assert analysis["eventId"] == event_id
    assert analysis["provenance"] == "synthetic"
    assert analysis["scoringMethodId"] == "geometric_progression_v1"
    assert analysis["observed"]["compositeScore"] is not None
    assert analysis["completeness"]["hasAlignedFrame"] is True
    assert analysis["completeness"]["teammatePositionsInFrame"] == 11
    assert analysis["completeness"]["opponentPositionsInFrame"] == 11
    assert analysis["alternatives"]

    frame_positions = {
        row["playerId"]: row for row in aligned_frame["players"]
    }
    candidate_ids = {row["id"] for row in players}
    for alternative in analysis["alternatives"]:
        target_id = alternative["targetPlayerId"]
        assert alternative["kind"] == "hypothetical_pass"
        assert target_id in candidate_ids
        assert target_id in frame_positions
        assert alternative["end"] == frame_positions[target_id]["position"]
        assert alternative["compositeScore"] is not None
        assert any(
            item["actionId"] == alternative["actionId"]
            and item["compositeScore"] == alternative["compositeScore"]
            for item in analysis["ranking"]
        )
    assert all(
        claim["status"] in {"verified", "partially_supported", "unsupported"}
        for claim in analysis["claims"]
    )
    exhaustive_claim = next(
        claim
        for claim in analysis["claims"]
        if claim["id"] == f"claim-exhaustive-alternatives:{event_id}"
    )
    assert exhaustive_claim["status"] == "verified"
    assert any(ref["kind"] == "player_position" for ref in exhaustive_claim["evidence"])
    assert not any("sparse frame" in value.lower() for value in analysis["limitations"])
    assert not any(
        "sparse frame" in limitation.lower()
        for claim in analysis["claims"]
        for limitation in claim["limitations"]
    )


def test_phase8_journey_reports_missing_and_insufficient_data(
    phase8_client: TestClient,
) -> None:
    assert phase8_client.get("/api/v1/matches/not-a-match").status_code == 404

    matches = phase8_client.get("/api/v1/matches").json()["items"]
    match = next(row for row in matches if row["scenarioId"] == PHASE8_SCENARIO_ID)
    events = phase8_client.get(
        f"/api/v1/matches/{match['id']}/events"
    ).json()["items"]
    unsupported = next(event for event in events if event["type"] == "pressure")

    response = phase8_client.get(
        f"/api/v1/matches/{match['id']}/events/{unsupported['id']}/decision-analysis"
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "insufficient_evidence"

    assert phase8_client.get(
        f"/api/v1/matches/{match['id']}/events/missing-event/decision-analysis"
    ).status_code == 404


def test_phase8_overview_counts_coordinate_backed_actions(
    phase8_client: TestClient,
) -> None:
    stats = phase8_client.get("/api/v1/matches/overview").json()
    decisions = next(row for row in stats if row["id"] == "stat-decisions")
    assert decisions["value"] == "43"
    assert "coordinates required" in decisions["hint"]
