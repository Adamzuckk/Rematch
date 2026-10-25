"""Ask-the-Crew POST /matches/{id}/ask contract tests."""

from __future__ import annotations

from app.services.ask import classify_ask_intent

MATCH_ID = "m-northgate-riverside-2401"
PASS_EVENT = "evt-ng-pass-12"
SHOT_EVENT = "evt-ng-shot-23"
POSSESSION_EVENT = "evt-ng-possession-52"


def test_classify_greeting_and_help() -> None:
    assert classify_ask_intent("hi") == "greeting"
    assert classify_ask_intent("Hello!") == "greeting"
    assert classify_ask_intent("help") == "help"
    assert classify_ask_intent("Who scored the most xG?") == "unsupported"


def test_ask_greeting_returns_visible_capability_answer(client) -> None:
    response = client.post(
        f"/api/v1/matches/{MATCH_ID}/ask",
        json={"question": "hi", "eventId": PASS_EVENT, "language": "en"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "answered"
    assert body["intent"] == "greeting"
    assert body["matchId"] == MATCH_ID
    assert body["eventId"] == PASS_EVENT
    assert "Ask the crew" in body["answer"]["english"]["headline"]
    assert body["answer"]["english"]["keyObservations"]
    assert "capability" in body["factClasses"]
    assert "unrestricted" in (body["reason"] or "").lower() or "Capability" in (
        body["reason"] or ""
    )


def test_ask_local_facts_from_selected_event(client) -> None:
    response = client.post(
        f"/api/v1/matches/{MATCH_ID}/ask",
        json={
            "question": "Which player was involved in this moment?",
            "eventId": PASS_EVENT,
            "language": "en",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "answered"
    assert body["intent"] == "local_facts"
    assert body["eventId"] == PASS_EVENT
    observations = " ".join(body["answer"]["english"]["keyObservations"])
    assert "Player:" in observations
    assert "Event type: pass" in observations
    assert body["evidence"]


def test_ask_narrative_uses_decision_agents(client) -> None:
    response = client.post(
        f"/api/v1/matches/{MATCH_ID}/ask",
        json={
            "question": "Why did this decision unfold this way?",
            "eventId": PASS_EVENT,
            "language": "en",
            "clientRequestId": "req-1",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in ("answered", "partial")
    assert body["intent"] == "narrative"
    assert body["clientRequestId"] == "req-1"
    assert body["answer"]["english"]["headline"]
    assert body["answer"]["arabic"]["headline"]
    assert body["verificationResults"]


def test_ask_verification_intent(client) -> None:
    response = client.post(
        f"/api/v1/matches/{MATCH_ID}/ask",
        json={
            "question": "What evidence supports this analysis?",
            "eventId": PASS_EVENT,
            "language": "en",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "verification"
    assert body["verificationResults"]
    assert "Evidence checks" in body["answer"]["english"]["headline"]


def test_ask_unsupported_tactics_is_explicit(client) -> None:
    response = client.post(
        f"/api/v1/matches/{MATCH_ID}/ask",
        json={
            "question": "What would change if the team pressed higher?",
            "eventId": PASS_EVENT,
            "language": "en",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "unsupported"
    assert body["intent"] in ("unsupported", "whatif")
    assert body["answer"]["english"]["keyObservations"]


def test_ask_requires_event_for_narrative(client) -> None:
    response = client.post(
        f"/api/v1/matches/{MATCH_ID}/ask",
        json={"question": "Why did this decision unfold this way?", "language": "en"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "unavailable"
    assert body["eventId"] is None


def test_ask_non_decision_falls_back_to_event_intelligence(client) -> None:
    response = client.post(
        f"/api/v1/matches/{MATCH_ID}/ask",
        json={
            "question": "What happened in this moment?",
            "eventId": POSSESSION_EVENT,
            "language": "en",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in ("answered", "partial")
    assert body["intent"] == "narrative"
    assert body["eventId"] == POSSESSION_EVENT
    assert body["answer"]["english"]["headline"]


def test_ask_match_not_found(client) -> None:
    response = client.post(
        "/api/v1/matches/does-not-exist/ask",
        json={"question": "hi"},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "match_not_found"


def test_ask_event_not_found(client) -> None:
    response = client.post(
        f"/api/v1/matches/{MATCH_ID}/ask",
        json={"question": "Who was involved?", "eventId": "evt-missing"},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "event_not_found"


def test_ask_empty_question_rejected(client) -> None:
    response = client.post(
        f"/api/v1/matches/{MATCH_ID}/ask",
        json={"question": "   "},
    )
    assert response.status_code == 422


def test_ask_goal_narrative(client) -> None:
    response = client.post(
        f"/api/v1/matches/{MATCH_ID}/ask",
        json={
            "question": "Why did this goal happen?",
            "eventId": SHOT_EVENT,
            "language": "en",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in ("answered", "partial", "unavailable")
    assert body["answer"]["english"]["headline"]
