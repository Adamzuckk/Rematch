from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.match import Match
from app.services import live_clock

NORTHGATE = "m-northgate-riverside-2401"
LAKESIDE = "m-lakeside-ironford-2405"
SEED_NOW = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)


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
    assert all(item["homeTeam"].get("coachName") for item in body["items"])


def test_list_matches_status_filter(client: TestClient) -> None:
    response = client.get("/api/v1/matches", params={"status": "live"})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert {item["id"] for item in body["items"]} == {
        "m-northgate-riverside-2401",
        "m-harbor-eastbridge-2402",
        "m-westfield-portside-2406",
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
    assert body["homeTeam"]["coachName"] == "Helena Crowe"
    assert body["status"] == "live"
    assert body["minute"] == 67
    assert body["score"]["home"] >= 0
    assert body["score"]["away"] >= 0
    assert body["provenance"] == "synthetic"
    assert body["scenarioId"] == "rematch-phase4-v1"
    assert body["liveRealDurationSeconds"] == 180
    assert body["canStart"] is False


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
    assert body["total"] > 10
    assert len(body["items"]) == body["total"] or len(body["items"]) == body["limit"]
    assert all(item["provenance"] == "synthetic" for item in body["items"])
    types = {item["type"] for item in body["items"]}
    assert "pass" in types
    assert "shot" in types
    # Live cutoff at minute 67 — later events stay hidden.
    assert all((item.get("minute") or 0) <= 67 for item in body["items"])
    classic = next(item for item in body["items"] if item["id"] == "evt-ng-pass-12")
    assert classic["start"] == {"x": 42.0, "y": 48.0}


def test_get_events_unknown_match_404(client: TestClient) -> None:
    response = client.get("/api/v1/matches/missing/events")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "match_not_found"


def test_get_frames(client: TestClient) -> None:
    response = client.get(f"/api/v1/matches/{NORTHGATE}/frames")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] > 3
    frame = body["items"][0]
    assert frame["provenance"] == "synthetic"
    assert frame["ball"]["position"]["x"] is not None
    assert len(frame["players"]) >= 3
    assert all(0 <= p["position"]["x"] <= 100 for p in frame["players"])


def test_get_frames_finished_match_has_frames(client: TestClient) -> None:
    response = client.get("/api/v1/matches/m-oakwood-silvermere-2403/frames")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] > 0
    assert len(body["items"]) > 0


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
    assert any(stat["id"] == "stat-live" and stat["value"] == "3" for stat in stats)
    assert all(stat["isDemoValue"] is True for stat in stats)


def test_match_players(client: TestClient) -> None:
    response = client.get(f"/api/v1/matches/{NORTHGATE}/players")
    assert response.status_code == 200
    players = response.json()
    # Full XI + bench for both sides.
    assert len(players) == 30
    assert {p["id"] for p in players} >= {
        "player-northgate-8",
        "player-northgate-9",
        "player-northgate-11",
        "player-northgate-12",
    }
    assert all(p.get("role") for p in players)


def test_match_context_and_team_form(client: TestClient) -> None:
    context = client.get(f"/api/v1/matches/{NORTHGATE}/context")
    assert context.status_code == 200
    body = context.json()
    assert body["homeCoachName"] == "Helena Crowe"
    assert body["awayCoachName"] == "Marcus Bellini"
    assert len(body["homeForm"]) == 5
    assert len(body["awayForm"]) == 5
    assert len(body["homePlayers"]) == 15
    assert len(body["playerStats"]) >= 1

    form = client.get("/api/v1/matches/teams/team-northgate/form")
    assert form.status_code == 200
    assert len(form.json()) == 5
    assert {row["result"] for row in form.json()} <= {"W", "D", "L"}


def test_start_upcoming_match(client: TestClient, seeded_db: Session, monkeypatch) -> None:
    before = client.get(f"/api/v1/matches/{LAKESIDE}")
    assert before.status_code == 200
    assert before.json()["status"] == "upcoming"
    assert before.json()["canStart"] is True
    assert before.json()["score"] is None

    started = client.post(f"/api/v1/matches/{LAKESIDE}/start")
    assert started.status_code == 200
    body = started.json()
    assert body["started"] is True
    assert body["match"]["status"] == "live"
    assert body["match"]["minute"] == 0
    assert body["match"]["score"] == {"home": 0, "away": 0}
    assert body["match"]["canStart"] is False

    # Advance wall clock ~1 real minute → ~30' match minute.
    later = SEED_NOW + timedelta(seconds=60)
    monkeypatch.setattr(live_clock, "utc_now", lambda: later)
    mid = client.get(f"/api/v1/matches/{LAKESIDE}")
    assert mid.status_code == 200
    assert mid.json()["status"] == "live"
    assert mid.json()["minute"] == 30

    # Finish after full 3 real minutes.
    done_at = SEED_NOW + timedelta(seconds=180)
    monkeypatch.setattr(live_clock, "utc_now", lambda: done_at)
    done = client.get(f"/api/v1/matches/{LAKESIDE}")
    assert done.status_code == 200
    assert done.json()["status"] == "finished"
    assert done.json()["minute"] == 90
    assert done.json()["score"]["home"] + done.json()["score"]["away"] >= 1

    # Cannot start again.
    again = client.post(f"/api/v1/matches/{LAKESIDE}/start")
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "match_not_startable"

    # Sanity: row persisted
    match = seeded_db.get(Match, LAKESIDE)
    assert match is not None
    assert match.status == "finished"


def test_start_live_match_conflict(client: TestClient) -> None:
    response = client.post(f"/api/v1/matches/{NORTHGATE}/start")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "match_not_startable"


def test_match_intelligence_returns_only_typed_seed_aggregates(
    client: TestClient,
) -> None:
    response = client.get(f"/api/v1/matches/{NORTHGATE}/intelligence")

    assert response.status_code == 200
    body = response.json()
    assert body["matchId"] == NORTHGATE
    assert body["provenance"] == "synthetic"
    assert body["source"] == "seeded_events_only"
    assert body["totalEvents"] == sum(body["eventCounts"].values())
    assert isinstance(body["keyMoments"], list)
    assert isinstance(body["limitations"], list)


def test_match_intelligence_missing_match_uses_match_not_found_error(
    client: TestClient,
) -> None:
    response = client.get("/api/v1/matches/missing/intelligence")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "match_not_found"
