"""Tests for optional LLM enrichment with mocked provider responses."""

from __future__ import annotations

import json

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.services.event_intelligence import (
    build_deterministic_event_intelligence,
    build_event_intelligence,
)
from app.services.llm.cache import clear_cache
from app.services.llm.client import complete_chat
from app.services.llm.enrich import enrich_event_intelligence
from app.services.llm.errors import LlmProviderError, LlmTimeoutError, LlmValidationError
from app.services.llm.status import llm_is_configured
from app.services.llm.validate import validate_llm_briefing

NORTHGATE = "m-northgate-riverside-2401"


@pytest.fixture(autouse=True)
def _clear_llm_cache() -> None:
    clear_cache()
    yield
    clear_cache()



def _valid_briefing_json(*, minute: str = "12") -> str:
    return json.dumps(
        {
            "english": {
                "headline": f"Recorded moment at minute {minute}",
                "keyObservations": [
                    f"The match log records the action around minute {minute}."
                ],
                "limitations": [
                    "Synthetic demo data — not official match statistics.",
                    "Hypotheses are marked separately from verified facts.",
                ],
                "whatHappened": [
                    f"At minute {minute} the event is present on the match record."
                ],
                "whyItMattered": [
                    "Impact is described only from recorded fields and calculated geometry."
                ],
                "whatCouldHaveHappened": [
                    "Hypothesis: an alternative action may have changed the attack progression."
                ],
            },
            "arabic": {
                "headline": f"لحظة مسجّلة في الدقيقة {minute}",
                "keyObservations": [f"يسجّل السجل الحدث حول الدقيقة {minute}."],
                "limitations": [
                    "البيانات اصطناعية وليست إحصاءات رسمية للمباراة.",
                ],
                "whatHappened": [f"في الدقيقة {minute} يظهر الحدث في سجل المباراة."],
                "whyItMattered": [
                    "يُوصف الأثر فقط من الحقول المسجّلة والمقاييس الهندسية المحسوبة."
                ],
                "whatCouldHaveHappened": [
                    "فرضية: قد يغيّر خيار بديل مسار الهجمة."
                ],
            },
        },
        ensure_ascii=False,
    )


def _mock_transport(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def _llm_settings(**overrides) -> Settings:
    base = dict(
        _env_file=None,
        llm_enabled=True,
        llm_provider="openai",
        llm_api_key="test-llm-api-key-not-a-real-secret-012345",
        llm_model="gpt-4o-mini",
        llm_timeout_seconds=5.0,
        llm_max_tokens=800,
        llm_max_retries=0,
        llm_cache_max_entries=0,
    )
    base.update(overrides)
    return Settings(**base)


def test_llm_disabled_is_not_configured() -> None:
    settings = Settings(_env_file=None, llm_enabled=False)
    assert llm_is_configured(settings) is False


def test_llm_enabled_requires_api_key() -> None:
    with pytest.raises(ValidationError, match="LLM_API_KEY"):
        Settings(_env_file=None, llm_enabled=True, llm_api_key=None)


def test_azure_requires_endpoint_and_deployment() -> None:
    with pytest.raises(ValidationError, match="LLM_BASE_URL"):
        Settings(
            _env_file=None,
            llm_enabled=True,
            llm_provider="azure_openai",
            llm_api_key="test-llm-api-key-not-a-real-secret-012345",
            llm_model="gpt-4o-mini",
        )


def test_complete_chat_parses_provider_payload() -> None:
    settings = _llm_settings()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("Authorization", "").startswith("Bearer ")
        assert "test-llm-api-key" not in request.url.path
        body = json.loads(request.content.decode())
        assert body["model"] == "gpt-4o-mini"
        assert body["response_format"] == {"type": "json_object"}
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": _valid_briefing_json()}},
                ]
            },
        )

    with _mock_transport(handler) as client:
        text = complete_chat(
            [{"role": "user", "content": "hi"}],
            settings=settings,
            client=client,
        )
    assert "whatHappened" in text


def test_complete_chat_timeout_maps_to_error() -> None:
    settings = _llm_settings(llm_timeout_seconds=0.01)

    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow")

    with _mock_transport(handler) as client:
        with pytest.raises(LlmTimeoutError):
            complete_chat(
                [{"role": "user", "content": "hi"}],
                settings=settings,
                client=client,
            )


def test_complete_chat_http_error() -> None:
    settings = _llm_settings()

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "unavailable"})

    with _mock_transport(handler) as client:
        with pytest.raises(LlmProviderError, match="503"):
            complete_chat(
                [{"role": "user", "content": "hi"}],
                settings=settings,
                client=client,
            )


def test_validate_rejects_unverified_numbers(seeded_db) -> None:
    deterministic = build_deterministic_event_intelligence(
        seeded_db, NORTHGATE, "evt-ng-pass-12"
    )
    from app.services.llm.evidence_pack import build_evidence_pack

    pack = build_evidence_pack(deterministic)
    payload = json.loads(_valid_briefing_json(minute="12"))
    payload["english"]["whyItMattered"] = [
        "The composite score jumped to 987654.321 without evidence."
    ]
    with pytest.raises(LlmValidationError, match="unverified number"):
        validate_llm_briefing(json.dumps(payload), evidence_pack=pack)


def test_validate_accepts_rounded_evidence_floats(seeded_db) -> None:
    """Models often shorten long floats; grounding must allow that rounding."""
    deterministic = build_deterministic_event_intelligence(
        seeded_db, NORTHGATE, "evt-ng-carry-64"
    )
    from app.services.llm.evidence_pack import build_evidence_pack

    pack = build_evidence_pack(deterministic)
    score = pack.get("decisionGeometry", {}).get("observed", {}).get("compositeScore")
    assert isinstance(score, (int, float))
    rounded = f"{float(score):.3f}".rstrip("0").rstrip(".")
    payload = json.loads(_valid_briefing_json(minute="64"))
    payload["english"]["whyItMattered"] = [
        f"The calculated geometric composite score is {rounded}."
    ]
    payload["arabic"]["whyItMattered"] = [
        f"المقياس الهندسي المحسوب هو {rounded}."
    ]
    briefing = validate_llm_briefing(json.dumps(payload), evidence_pack=pack)
    assert rounded in briefing.english.whyItMattered[0]


def test_validate_rejects_xg_claim(seeded_db) -> None:
    deterministic = build_deterministic_event_intelligence(
        seeded_db, NORTHGATE, "evt-ng-shot-23"
    )
    from app.services.llm.evidence_pack import build_evidence_pack
    import re

    pack = build_evidence_pack(deterministic)
    minute_token = "23"
    for stmt in deterministic.statements:
        found = re.search(r"minute\s+(\d+(?:\.\d+)?)", stmt.english, re.I)
        if found:
            minute_token = found.group(1)
            break
    payload = json.loads(_valid_briefing_json(minute=minute_token))
    payload["english"]["whyItMattered"] = ["This raised expected goals substantially."]
    with pytest.raises(LlmValidationError, match="forbidden"):
        validate_llm_briefing(json.dumps(payload), evidence_pack=pack)


def test_validate_allows_negated_xg_disclaimer(seeded_db) -> None:
    deterministic = build_deterministic_event_intelligence(
        seeded_db, NORTHGATE, "evt-ng-shot-23"
    )
    from app.services.llm.evidence_pack import build_evidence_pack
    import re

    pack = build_evidence_pack(deterministic)
    minute_token = "23"
    for stmt in deterministic.statements:
        found = re.search(r"minute\s+(\d+(?:\.\d+)?)", stmt.english, re.I)
        if found:
            minute_token = found.group(1)
            break
    payload = json.loads(_valid_briefing_json(minute=minute_token))
    payload["english"]["limitations"] = [
        "geometric_progression_v1 is not xG, probability, or an objective quality judgment.",
        "Synthetic demo data — not official statistics.",
    ]
    briefing = validate_llm_briefing(json.dumps(payload), evidence_pack=pack)
    assert any("not xG" in row for row in briefing.english.limitations)


def test_enrich_success_sets_llm_connected(seeded_db) -> None:
    deterministic = build_deterministic_event_intelligence(
        seeded_db, NORTHGATE, "evt-ng-pass-12"
    )
    # Use a minute that appears in the deterministic statements.
    minute_token = None
    for stmt in deterministic.statements:
        if "minute" in stmt.english.lower():
            import re

            found = re.search(r"minute\s+(\d+(?:\.\d+)?)", stmt.english, re.I)
            if found:
                minute_token = found.group(1)
                break
    assert minute_token is not None
    content = _valid_briefing_json(minute=minute_token)
    settings = _llm_settings()

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": content}}]},
        )

    with _mock_transport(handler) as client:
        enriched = enrich_event_intelligence(
            deterministic, settings=settings, http_client=client
        )

    assert enriched.llmConnected is True
    assert enriched.analysisMethod == "llm_grounded_event_intelligence_v1"
    assert enriched.english.whatHappened
    assert enriched.arabic.whatHappened
    assert enriched.statements == deterministic.statements
    assert any("enriched by an external AI" in row for row in enriched.limitations)


def test_enrich_provider_failure_falls_back(seeded_db) -> None:
    deterministic = build_deterministic_event_intelligence(
        seeded_db, NORTHGATE, "evt-ng-pass-12"
    )
    settings = _llm_settings()

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    with _mock_transport(handler) as client:
        result = enrich_event_intelligence(
            deterministic, settings=settings, http_client=client
        )

    assert result.llmConnected is False
    assert result.analysisMethod.startswith("deterministic_")
    assert result.english.headline == deterministic.english.headline
    assert any("failed" in row.lower() for row in result.limitations)


def test_enrich_invalid_json_falls_back(seeded_db) -> None:
    deterministic = build_deterministic_event_intelligence(
        seeded_db, NORTHGATE, "evt-ng-carry-64"
    )
    settings = _llm_settings()

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "not-json"}}]},
        )

    with _mock_transport(handler) as client:
        result = enrich_event_intelligence(
            deterministic, settings=settings, http_client=client
        )

    assert result.llmConnected is False
    assert any("LlmValidationError" in row for row in result.limitations)


def test_build_event_intelligence_with_mocked_provider(
    seeded_db, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv(
        "LLM_API_KEY", "test-llm-api-key-not-a-real-secret-012345"
    )
    monkeypatch.setenv("LLM_MODEL", "gpt-4o-mini")
    get_settings.cache_clear()

    deterministic = build_deterministic_event_intelligence(
        seeded_db, NORTHGATE, "evt-ng-pass-12"
    )
    import re

    minute_token = "12"
    for stmt in deterministic.statements:
        found = re.search(r"minute\s+(\d+(?:\.\d+)?)", stmt.english, re.I)
        if found:
            minute_token = found.group(1)
            break
    content = _valid_briefing_json(minute=minute_token)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": content}}]},
        )

    # Patch enrich's complete_chat path via httpx.Client used inside enrich —
    # inject by patching enrich_event_intelligence's client factory through
    # monkeypatch on complete_chat wrapper.
    from app.services import llm as llm_pkg
    from app.services.llm import enrich as enrich_mod

    real_enrich = enrich_mod.enrich_event_intelligence

    def enrich_with_mock(det, **_kwargs):
        with _mock_transport(handler) as client:
            return real_enrich(det, settings=get_settings(), http_client=client)

    monkeypatch.setattr(llm_pkg, "enrich_event_intelligence", enrich_with_mock)
    monkeypatch.setattr(
        "app.services.event_intelligence.enrich_event_intelligence",
        enrich_with_mock,
    )

    result = build_event_intelligence(seeded_db, NORTHGATE, "evt-ng-pass-12")
    assert result.llmConnected is True
    get_settings.cache_clear()


def test_api_event_intelligence_stays_disconnected_without_llm(
    client,
) -> None:
    response = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-ng-pass-12/event-intelligence"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["llmConnected"] is False
    assert "LLM_API_KEY" not in json.dumps(body)
