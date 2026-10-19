"""HTTP tests for decision-analysis endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

NORTHGATE = "m-northgate-riverside-2401"
OAKWOOD = "m-oakwood-silvermere-2403"


def test_decision_analysis_pass(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-ng-pass-12/decision-analysis"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["matchId"] == NORTHGATE
    assert body["eventId"] == "evt-ng-pass-12"
    assert body["eventType"] == "pass"
    assert body["scoringMethodId"] == "geometric_progression_v1"
    assert body["provenance"] == "synthetic"
    assert body["observed"]["compositeScore"] is not None
    assert body["observed"]["rankable"] is True
    assert isinstance(body["alternatives"], list)
    assert body["completeness"]["hasAlignedFrame"] is True
    assert body["confidence"] in {"high", "medium", "low", "none"}
    assert any(c["status"] == "verified" for c in body["claims"])
    assert any(c["status"] == "partially_supported" for c in body["claims"])
    # Schema shape: no silent fabricated xG fields
    assert "xG" not in body
    assert "expectedGoals" not in str(body)


def test_decision_analysis_carry_ranks_alternative(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-ng-carry-64/decision-analysis"
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["alternatives"]) == 1
    assert body["alternatives"][0]["targetPlayerId"] == "player-northgate-9"
    ranks = {row["actionId"]: row["rank"] for row in body["ranking"] if row["rank"]}
    alt_id = body["alternatives"][0]["actionId"]
    obs_id = body["observed"]["actionId"]
    assert ranks[alt_id] == 1
    assert ranks[obs_id] == 2
    assert body["completeness"]["level"] == "complete"


def test_decision_analysis_match_404(client: TestClient) -> None:
    response = client.get(
        "/api/v1/matches/does-not-exist/events/evt-ng-pass-12/decision-analysis"
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "match_not_found"


def test_decision_analysis_event_404(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-missing/decision-analysis"
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "event_not_found"


def test_decision_analysis_wrong_match_event_404(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-oak-pass-18/decision-analysis"
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "event_not_found"


def test_decision_analysis_insufficient_evidence(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-ng-possession-52/decision-analysis"
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "insufficient_evidence"
    assert "decision candidate" in body["error"]["message"]


def test_decision_analysis_tackle_insufficient(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{OAKWOOD}/events/evt-oak-tackle-55/decision-analysis"
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "insufficient_evidence"


def test_evidence_endpoint(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-ng-carry-64/decision-analysis/evidence"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["matchId"] == NORTHGATE
    assert body["eventId"] == "evt-ng-carry-64"
    assert "frm-ng-64" in body["frameIds"]
    assert "evt-ng-carry-64" in body["eventIds"]
    assert len(body["claims"]) >= 2
    assert all("status" in c and "reason" in c for c in body["claims"])
    assert body["provenance"] == "synthetic"


def test_verify_endpoint_flags_bad_refs(client: TestClient) -> None:
    payload = {
        "claims": [
            {
                "id": "user-1",
                "statement": "Uses a real event",
                "status": "unsupported",
                "evidence": [
                    {
                        "kind": "event",
                        "id": "evt-ng-carry-64",
                        "matchId": NORTHGATE,
                    }
                ],
                "reason": "",
                "limitations": [],
                "calculation": None,
            },
            {
                "id": "user-2",
                "statement": "Invented frame",
                "status": "unsupported",
                "evidence": [
                    {
                        "kind": "frame",
                        "id": "frm-fake",
                        "matchId": NORTHGATE,
                    }
                ],
                "reason": "",
                "limitations": [],
                "calculation": None,
            },
            {
                "id": "user-3",
                "statement": "No evidence",
                "status": "unsupported",
                "evidence": [],
                "reason": "",
                "limitations": [],
                "calculation": None,
            },
        ]
    }
    response = client.post(
        f"/api/v1/matches/{NORTHGATE}/events/evt-ng-carry-64/decision-analysis/verify",
        json=payload,
    )
    assert response.status_code == 200
    body = response.json()
    by_id = {c["id"]: c for c in body}
    assert by_id["user-1"]["status"] == "verified"
    assert by_id["user-2"]["status"] == "unsupported"
    assert by_id["user-3"]["status"] == "unsupported"


def test_oakwood_analysis_sparse(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{OAKWOOD}/events/evt-oak-pass-18/decision-analysis"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["alternatives"] == []
    assert body["completeness"]["hasAlignedFrame"] is False
    assert body["confidence"] == "low"
    assert any(c["status"] == "unsupported" for c in body["claims"])
