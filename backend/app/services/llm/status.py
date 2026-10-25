"""Honest LLM readiness checks — never claim connected without credentials."""

from __future__ import annotations

from typing import Literal

from app.core.config import Settings, get_settings

LlmProviderName = Literal["openai", "azure_openai", "openai_compatible", "gemini"]


def llm_is_configured(settings: Settings | None = None) -> bool:
    """True only when enrichment is enabled and required secrets/endpoints exist.

    This does not prove the remote provider is reachable — only that Rematch is
    configured to attempt a call. Response `llmConnected` stays false until a
    successful, validated enrichment completes.
    """
    cfg = settings or get_settings()
    if not cfg.llm_enabled:
        return False
    key = cfg.resolved_llm_api_key()
    if not key:
        return False

    provider = cfg.llm_provider
    if provider == "openai":
        return bool(cfg.llm_model.strip())
    if provider == "azure_openai":
        return bool(
            (cfg.llm_base_url or "").strip()
            and (cfg.llm_azure_deployment or "").strip()
            and cfg.llm_model.strip()
        )
    if provider == "openai_compatible":
        return bool((cfg.llm_base_url or "").strip() and cfg.llm_model.strip())
    if provider == "gemini":
        return bool(cfg.resolved_llm_model())
    return False


def provider_display_name(settings: Settings | None = None) -> str | None:
    if not llm_is_configured(settings):
        return None
    cfg = settings or get_settings()
    return cfg.llm_provider
