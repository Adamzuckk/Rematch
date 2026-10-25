"""HTTP and service tests for evidence-grounded event intelligence."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.event_intelligence import build_event_intelligence

NORTHGATE = "m-northgate-riverside-2401"


def test_event_intelligence_pass_endpoint(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-ng-pass-12/event-intelligence"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["matchId"] == NORTHGATE
    assert body["eventId"] == "evt-ng-pass-12"
    assert body["eventType"] == "pass"
    assert body["llmConnected"] is False
    assert body["decisionCandidate"] is True
    assert body["analysisMethod"].startswith("deterministic_")
    assert body["english"]["whatHappened"]
    assert body["english"]["whyItMattered"]
    assert body["arabic"]["whatHappened"]
    assert body["decisionAnalysis"] is not None
    assert all(
        item["tier"] in {"fact", "metric", "hypothesis", "missing"}
        for item in body["statements"]
    )
    assert any("no external" in row.lower() for row in body["limitations"])


def test_event_intelligence_shot_goal_fields(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-ng-shot-23/event-intelligence"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["eventType"] == "shot"
    assert body["llmConnected"] is False
    assert body["decisionCandidate"] is True
    joined = " ".join(s["english"] for s in body["statements"]).lower()
    assert "shot" in joined or "goal" in joined or "outcome" in joined
    # Assist is only claimed when recorded; otherwise the gap is explicit.
    if "assist provider on record" in joined:
        assert "assist provider is not present" not in joined
    else:
        assert (
            "assistplayerid" in [m.lower() for m in body["missingEvidence"]]
            or "assist" in joined
            or "penalty" in joined
        )


def test_event_intelligence_non_decision_event(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-ng-possession-52/event-intelligence"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["eventType"] == "possession_change"
    assert body["decisionCandidate"] is False
    assert body["decisionAnalysis"] is None
    assert body["llmConnected"] is False
    assert body["english"]["headline"]
    assert body["arabic"]["headline"]


def test_event_intelligence_match_404(client: TestClient) -> None:
    response = client.get(
        "/api/v1/matches/does-not-exist/events/evt-ng-pass-12/event-intelligence"
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "match_not_found"


def test_event_intelligence_event_404(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-missing/event-intelligence"
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "event_not_found"


def test_build_event_intelligence_llm_disconnected_by_default(seeded_db) -> None:
    """Without LLM_* configuration, briefings stay deterministic and honest."""
    result = build_event_intelligence(seeded_db, NORTHGATE, "evt-ng-carry-64")
    assert result.llmConnected is False
    assert result.analysisMethod.startswith("deterministic_")
    assert result.english.whatHappened
    assert result.arabic.whatCouldHaveHappened
    assert result.decisionCandidate is True
    assert result.decisionAnalysis is not None
    assert any("no external" in row.lower() for row in result.limitations)
