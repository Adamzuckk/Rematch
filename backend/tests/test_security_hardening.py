"""Regression tests for application-layer security hardening."""

from __future__ import annotations

from fastapi.testclient import TestClient

NORTHGATE = "m-northgate-riverside-2401"
EVENT = "evt-ng-carry-64"


def _claim(claim_id: str = "user-1") -> dict:
    return {
        "id": claim_id,
        "statement": "Synthetic claim for security regression",
        "status": "unsupported",
        "evidence": [],
        "reason": "",
        "limitations": [],
        "calculation": None,
    }


def test_api_responses_include_security_headers(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "camera=()" in response.headers["permissions-policy"]
    assert response.headers["cache-control"] == "no-store"


def test_search_query_rejects_oversized_input(client: TestClient) -> None:
    response = client.get("/api/v1/matches", params={"q": "x" * 101})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_competition_filter_rejects_oversized_input(client: TestClient) -> None:
    response = client.get("/api/v1/matches", params={"competition": "c" * 121})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_match_id_path_rejects_oversized_input(client: TestClient) -> None:
    response = client.get(f"/api/v1/matches/{'m-' + ('a' * 130)}")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_like_wildcards_are_treated_literally(client: TestClient) -> None:
    # Without escaping, "%" would match every competition/team name.
    response = client.get("/api/v1/matches", params={"q": "%"})
    assert response.status_code == 200
    assert response.json()["total"] == 0
    assert response.json()["items"] == []


def test_verify_rejects_too_many_claims(client: TestClient) -> None:
    payload = {"claims": [_claim(f"user-{i}") for i in range(33)]}
    response = client.post(
        f"/api/v1/matches/{NORTHGATE}/events/{EVENT}/decision-analysis/verify",
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_verify_rejects_oversized_statement(client: TestClient) -> None:
    claim = _claim()
    claim["statement"] = "s" * 2001
    response = client.post(
        f"/api/v1/matches/{NORTHGATE}/events/{EVENT}/decision-analysis/verify",
        json={"claims": [claim]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_verify_rejects_oversized_calculation_payload(client: TestClient) -> None:
    claim = _claim()
    claim["calculation"] = {"blob": "x" * 9000}
    response = client.post(
        f"/api/v1/matches/{NORTHGATE}/events/{EVENT}/decision-analysis/verify",
        json={"claims": [claim]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_verify_still_accepts_bounded_valid_payload(client: TestClient) -> None:
    payload = {
        "claims": [
            {
                "id": "user-ok",
                "statement": "Event exists",
                "status": "unsupported",
                "evidence": [
                    {
                        "kind": "event",
                        "id": EVENT,
                        "matchId": NORTHGATE,
                    }
                ],
                "reason": "",
                "limitations": [],
                "calculation": None,
            }
        ]
    }
    response = client.post(
        f"/api/v1/matches/{NORTHGATE}/events/{EVENT}/decision-analysis/verify",
        json=payload,
    )
    assert response.status_code == 200
    body = response.json()
    assert body[0]["id"] == "user-ok"
    assert body[0]["status"] == "verified"
