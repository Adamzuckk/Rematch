from fastapi.testclient import TestClient

NORTHGATE = "m-northgate-riverside-2401"


def test_list_matches(client: TestClient) -> None:
    response = client.get("/api/v1/matches")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 6
    assert body["limit"] == 50
    assert body["offset"] == 0
    assert len(body["items"]) == 6
    assert all(item["provenance"] == "synthetic" for item in body["items"])
    assert all(item["scenarioId"] == "rematch-phase4-v1" for item in body["items"])


def test_list_matches_status_filter(client: TestClient) -> None:
    response = client.get("/api/v1/matches", params={"status": "live"})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert {item["id"] for item in body["items"]} == {
        "m-northgate-riverside-2401",
        "m-harbor-eastbridge-2402",
    }


def test_list_matches_competition_filter(client: TestClient) -> None:
    response = client.get(
        "/api/v1/matches",
        params={"competition": "metro premier cup"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert all(item["competition"] == "Metro Premier Cup" for item in body["items"])


def test_list_matches_invalid_status(client: TestClient) -> None:
    response = client.get("/api/v1/matches", params={"status": "cancelled"})
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"


def test_list_matches_limit_cap(client: TestClient) -> None:
    response = client.get("/api/v1/matches", params={"limit": 1000})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_limit"


def test_get_match_detail(client: TestClient) -> None:
    response = client.get(f"/api/v1/matches/{NORTHGATE}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == NORTHGATE
    assert body["homeTeam"]["name"] == "Northgate FC"
    assert body["awayTeam"]["shortName"] == "RIV"
    assert body["score"] == {"home": 1, "away": 1}
    assert body["provenance"] == "synthetic"
    assert body["scenarioId"] == "rematch-phase4-v1"


def test_get_match_unknown_404(client: TestClient) -> None:
    response = client.get("/api/v1/matches/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "match_not_found"
    assert "does-not-exist" in body["error"]["message"]


def test_get_events(client: TestClient) -> None:
    response = client.get(f"/api/v1/matches/{NORTHGATE}/events")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 6
    assert len(body["items"]) == 6
    assert body["items"][0]["type"] == "pass"
    assert body["items"][0]["start"] == {"x": 42.0, "y": 48.0}
    assert all(item["provenance"] == "synthetic" for item in body["items"])


def test_get_events_unknown_match_404(client: TestClient) -> None:
    response = client.get("/api/v1/matches/missing/events")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "match_not_found"


def test_get_frames(client: TestClient) -> None:
    response = client.get(f"/api/v1/matches/{NORTHGATE}/frames")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert len(body["items"]) == 3
    frame = body["items"][0]
    assert frame["provenance"] == "synthetic"
    assert frame["ball"]["position"]["x"] == 42.0
    assert len(frame["players"]) == 3
    assert all(0 <= p["position"]["x"] <= 100 for p in frame["players"])


def test_get_frames_empty_for_match_without_frames(client: TestClient) -> None:
    response = client.get("/api/v1/matches/m-oakwood-silvermere-2403/frames")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["items"] == []


def test_get_frames_unknown_match_404(client: TestClient) -> None:
    response = client.get("/api/v1/matches/missing/frames")
    assert response.status_code == 404


def test_dataset_and_overview(client: TestClient) -> None:
    dataset = client.get("/api/v1/matches/dataset")
    assert dataset.status_code == 200
    info = dataset.json()
    assert info["scenarioId"] == "rematch-phase4-v1"
    assert info["provenance"] == "synthetic"
    assert info["matchCount"] == 6

    overview = client.get("/api/v1/matches/overview")
    assert overview.status_code == 200
    stats = overview.json()
    assert any(stat["id"] == "stat-matches" and stat["value"] == "6" for stat in stats)
    assert all(stat["isDemoValue"] is True for stat in stats)


def test_match_players(client: TestClient) -> None:
    response = client.get(f"/api/v1/matches/{NORTHGATE}/players")
    assert response.status_code == 200
    players = response.json()
    assert len(players) >= 3
    assert {p["id"] for p in players} >= {
        "player-northgate-8",
        "player-northgate-9",
        "player-northgate-11",
    }
