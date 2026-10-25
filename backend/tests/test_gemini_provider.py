"""Gemini provider tests — mocked SDK only (no live quota)."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import ValidationError

from app.core.config import DEFAULT_GEMINI_MODEL, Settings, get_settings
from app.services.event_intelligence import build_deterministic_event_intelligence
from app.services.llm.cache import clear_cache
from app.services.llm.client import complete_chat
from app.services.llm.enrich import enrich_event_intelligence
from app.services.llm.errors import (
    LlmNotConfiguredError,
    LlmProviderError,
    LlmRateLimitError,
    LlmTimeoutError,
    LlmValidationError,
)
from app.services.llm.gemini import complete_gemini_chat
from app.services.llm.status import llm_is_configured

NORTHGATE = "m-northgate-riverside-2401"


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


def _gemini_settings(**overrides: Any) -> Settings:
    base: dict[str, Any] = dict(
        _env_file=None,
        llm_enabled=True,
        llm_provider="gemini",
        gemini_api_key="test-gemini-api-key-not-a-real-secret-012345",
        gemini_model=DEFAULT_GEMINI_MODEL,
        llm_timeout_seconds=5.0,
        llm_max_tokens=800,
        llm_max_retries=0,
        llm_cache_max_entries=32,
        llm_cache_ttl_seconds=600.0,
    )
    base.update(overrides)
    return Settings(**base)


class _FakeModels:
    def __init__(self, handler) -> None:
        self._handler = handler
        self.calls = 0

    def generate_content(self, **kwargs: Any) -> Any:
        self.calls += 1
        return self._handler(**kwargs)


class _FakeGeminiClient:
    def __init__(self, handler) -> None:
        self.models = _FakeModels(handler)
        self.closed = False

    def close(self) -> None:
        self.closed = True


@pytest.fixture(autouse=True)
def _clear_llm_cache() -> None:
    clear_cache()
    yield
    clear_cache()


def test_backend_starts_without_gemini_key() -> None:
    settings = Settings(_env_file=None, llm_enabled=False, llm_provider="gemini")
    assert llm_is_configured(settings) is False
    assert settings.resolved_llm_api_key() is None


def test_gemini_enabled_requires_gemini_api_key() -> None:
    with pytest.raises(ValidationError, match="GEMINI_API_KEY"):
        Settings(
            _env_file=None,
            llm_enabled=True,
            llm_provider="gemini",
            gemini_api_key=None,
        )


def test_gemini_does_not_use_llm_api_key() -> None:
    settings = Settings(
        _env_file=None,
        llm_enabled=True,
        llm_provider="gemini",
        gemini_api_key="test-gemini-api-key-not-a-real-secret-012345",
        llm_api_key="should-not-be-used-for-gemini-0123456789",
    )
    assert settings.resolved_llm_api_key() == "test-gemini-api-key-not-a-real-secret-012345"
    assert settings.resolved_llm_model() == DEFAULT_GEMINI_MODEL


def test_gemini_missing_config_raises() -> None:
    settings = Settings(_env_file=None, llm_enabled=False, llm_provider="gemini")
    with pytest.raises(LlmNotConfiguredError):
        complete_gemini_chat([{"role": "user", "content": "hi"}], settings=settings)


def test_gemini_success_returns_text() -> None:
    settings = _gemini_settings()
    payload = _valid_briefing_json()

    def handler(**_kwargs: Any) -> Any:
        return SimpleNamespace(text=payload, candidates=[])

    client = _FakeGeminiClient(handler)
    text = complete_chat(
        [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}],
        settings=settings,
        client=client,
    )
    assert "whatHappened" in text
    assert "لحظة" in text
    assert client.models.calls == 1


def test_gemini_quota_maps_to_rate_limit() -> None:
    from google.genai import errors as genai_errors

    settings = _gemini_settings()

    def handler(**_kwargs: Any) -> Any:
        raise genai_errors.APIError(429, {"error": {"message": "quota"}})

    with pytest.raises(LlmRateLimitError, match="429"):
        complete_gemini_chat(
            [{"role": "user", "content": "hi"}],
            settings=settings,
            client=_FakeGeminiClient(handler),
        )


def test_gemini_timeout_maps_to_error() -> None:
    settings = _gemini_settings(llm_timeout_seconds=0.01)

    def handler(**_kwargs: Any) -> Any:
        raise TimeoutError("slow")

    with pytest.raises(LlmTimeoutError):
        complete_gemini_chat(
            [{"role": "user", "content": "hi"}],
            settings=settings,
            client=_FakeGeminiClient(handler),
        )


def test_gemini_malformed_empty_content() -> None:
    settings = _gemini_settings()

    def handler(**_kwargs: Any) -> Any:
        return SimpleNamespace(text="   ", candidates=[])

    with pytest.raises(LlmProviderError, match="empty"):
        complete_gemini_chat(
            [{"role": "user", "content": "hi"}],
            settings=settings,
            client=_FakeGeminiClient(handler),
        )


def test_gemini_cache_avoids_duplicate_calls() -> None:
    settings = _gemini_settings()
    payload = _valid_briefing_json()

    def handler(**_kwargs: Any) -> Any:
        return SimpleNamespace(text=payload, candidates=[])

    client = _FakeGeminiClient(handler)
    messages = [{"role": "user", "content": "same-prompt-for-cache"}]
    first = complete_chat(messages, settings=settings, client=client)
    second = complete_chat(messages, settings=settings, client=client)
    assert first == second
    assert client.models.calls == 1


def test_enrich_gemini_success_sets_llm_connected(seeded_db) -> None:
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
    settings = _gemini_settings()

    def handler(**_kwargs: Any) -> Any:
        return SimpleNamespace(text=content, candidates=[])

    enriched = enrich_event_intelligence(
        deterministic,
        settings=settings,
        http_client=_FakeGeminiClient(handler),
    )
    assert enriched.llmConnected is True
    assert enriched.analysisMethod == "llm_grounded_event_intelligence_v1"
    assert enriched.english.whatHappened
    assert enriched.arabic.whatHappened
    assert any("لحظة" in row or "الدقيقة" in row for row in enriched.arabic.whatHappened)
    assert enriched.statements == deterministic.statements


def test_enrich_gemini_quota_falls_back(seeded_db) -> None:
    from google.genai import errors as genai_errors

    deterministic = build_deterministic_event_intelligence(
        seeded_db, NORTHGATE, "evt-ng-pass-12"
    )
    settings = _gemini_settings()

    def handler(**_kwargs: Any) -> Any:
        raise genai_errors.APIError(429, {"error": {"message": "quota"}})

    result = enrich_event_intelligence(
        deterministic,
        settings=settings,
        http_client=_FakeGeminiClient(handler),
    )
    assert result.llmConnected is False
    assert result.english.headline == deterministic.english.headline
    assert any("failed" in row.lower() for row in result.limitations)


def test_enrich_gemini_malformed_falls_back(seeded_db) -> None:
    deterministic = build_deterministic_event_intelligence(
        seeded_db, NORTHGATE, "evt-ng-carry-64"
    )
    settings = _gemini_settings()

    def handler(**_kwargs: Any) -> Any:
        return SimpleNamespace(text="not-json-at-all", candidates=[])

    result = enrich_event_intelligence(
        deterministic,
        settings=settings,
        http_client=_FakeGeminiClient(handler),
    )
    assert result.llmConnected is False
    assert any("LlmValidationError" in row for row in result.limitations)


def test_enrich_gemini_timeout_falls_back(seeded_db) -> None:
    deterministic = build_deterministic_event_intelligence(
        seeded_db, NORTHGATE, "evt-ng-pass-12"
    )
    settings = _gemini_settings()

    def handler(**_kwargs: Any) -> Any:
        raise TimeoutError("slow")

    result = enrich_event_intelligence(
        deterministic,
        settings=settings,
        http_client=_FakeGeminiClient(handler),
    )
    assert result.llmConnected is False
    assert any("LlmTimeoutError" in row for row in result.limitations)


def test_event_grounding_rejects_invented_assist(seeded_db) -> None:
    from app.services.llm.evidence_pack import build_evidence_pack
    from app.services.llm.validate import validate_llm_briefing

    deterministic = build_deterministic_event_intelligence(
        seeded_db, NORTHGATE, "evt-ng-shot-23"
    )
    pack = build_evidence_pack(deterministic)
    payload = json.loads(_valid_briefing_json(minute="23"))
    payload["english"]["whatHappened"] = [
        "Scorer Fake Player scored after an assist from Ghost Assistant."
    ]
    with pytest.raises(LlmValidationError, match="unverified name"):
        validate_llm_briefing(json.dumps(payload), evidence_pack=pack)


def test_api_response_never_leaks_gemini_key(client) -> None:
    response = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-ng-pass-12/event-intelligence"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["llmConnected"] is False
    dumped = json.dumps(body)
    assert "GEMINI_API_KEY" not in dumped
    assert "test-gemini" not in dumped


def test_gemini_env_wiring(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv(
        "GEMINI_API_KEY", "test-gemini-api-key-not-a-real-secret-012345"
    )
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    get_settings.cache_clear()
    try:
        cfg = get_settings()
        assert cfg.llm_provider == "gemini"
        assert llm_is_configured(cfg) is True
        assert cfg.resolved_llm_model() == "gemini-3.5-flash-lite"
    finally:
        get_settings.cache_clear()
