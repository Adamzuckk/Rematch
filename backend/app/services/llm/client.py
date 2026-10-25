"""Chat client for OpenAI-compatible HTTP APIs and Google Gemini."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.core.config import Settings, get_settings
from app.services.llm.cache import (
    cache_key,
    configure_cache,
    get_cached_response,
    set_cached_response,
)
from app.services.llm.errors import (
    LlmNotConfiguredError,
    LlmProviderError,
    LlmRateLimitError,
    LlmTimeoutError,
)
from app.services.llm.status import llm_is_configured

logger = logging.getLogger(__name__)

_RETRYABLE_HTTP = {408, 429, 500, 502, 503, 504}


def _chat_url(settings: Settings) -> str:
    provider = settings.llm_provider
    if provider == "openai":
        base = (settings.llm_base_url or "https://api.openai.com/v1").rstrip("/")
        return f"{base}/chat/completions"
    if provider == "azure_openai":
        endpoint = (settings.llm_base_url or "").rstrip("/")
        deployment = (settings.llm_azure_deployment or "").strip()
        version = settings.llm_azure_api_version.strip()
        return (
            f"{endpoint}/openai/deployments/{deployment}"
            f"/chat/completions?api-version={version}"
        )
    # openai_compatible
    base = (settings.llm_base_url or "").rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return f"{base}/chat/completions"


def _auth_headers(settings: Settings) -> dict[str, str]:
    key = settings.resolved_llm_api_key()
    if not key:
        raise LlmNotConfiguredError("LLM API key is not configured")
    if settings.llm_provider == "azure_openai":
        return {
            "api-key": key,
            "Content-Type": "application/json",
        }
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _request_body(settings: Settings, messages: list[dict[str, str]]) -> dict[str, Any]:
    body: dict[str, Any] = {
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": settings.llm_max_tokens,
    }
    # Azure uses deployment in the URL; some gateways still want model.
    if settings.llm_provider != "azure_openai" or settings.llm_model.strip():
        body["model"] = settings.resolved_llm_model()
    # Encourage JSON when the gateway understands it (OpenAI + many Azure deployments).
    if settings.llm_provider in {"openai", "azure_openai", "openai_compatible"}:
        body["response_format"] = {"type": "json_object"}
    return body


def _complete_openai_compatible(
    messages: list[dict[str, str]],
    *,
    settings: Settings,
    client: httpx.Client | None = None,
) -> str:
    url = _chat_url(settings)
    headers = _auth_headers(settings)
    payload = _request_body(settings, messages)
    timeout = httpx.Timeout(settings.llm_timeout_seconds)
    max_attempts = 1 + max(0, settings.llm_max_retries)

    owns_client = client is None
    http = client or httpx.Client(timeout=timeout)
    try:
        last_error: Exception | None = None
        for attempt in range(max_attempts):
            try:
                response = http.post(url, headers=headers, json=payload, timeout=timeout)
            except httpx.TimeoutException as exc:
                last_error = LlmTimeoutError(
                    f"LLM provider timed out after {settings.llm_timeout_seconds:g}s"
                )
                if attempt + 1 < max_attempts:
                    time.sleep(min(2.0, 0.25 * (2**attempt)))
                    continue
                raise last_error from exc
            except httpx.HTTPError as exc:
                raise LlmProviderError(
                    f"LLM provider request failed: {exc.__class__.__name__}"
                ) from exc

            if response.status_code in _RETRYABLE_HTTP and attempt + 1 < max_attempts:
                if response.status_code == 429:
                    last_error = LlmRateLimitError(
                        f"LLM provider rate limit or quota exceeded (HTTP {response.status_code})"
                    )
                else:
                    last_error = LlmProviderError(
                        f"LLM provider returned HTTP {response.status_code}"
                    )
                time.sleep(min(2.0, 0.25 * (2**attempt)))
                continue

            if response.status_code == 429:
                raise LlmRateLimitError(
                    f"LLM provider rate limit or quota exceeded (HTTP {response.status_code})"
                )
            if response.status_code >= 400:
                # Do not echo response bodies that might contain echoed secrets.
                raise LlmProviderError(
                    f"LLM provider returned HTTP {response.status_code}"
                )

            try:
                data = response.json()
            except ValueError as exc:
                raise LlmProviderError("LLM provider returned non-JSON body") from exc

            try:
                content = data["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError) as exc:
                raise LlmProviderError(
                    "LLM provider response missing message content"
                ) from exc

            if not isinstance(content, str) or not content.strip():
                raise LlmProviderError("LLM provider returned empty content")
            return content

        if last_error is not None:
            raise last_error
        raise LlmProviderError("LLM provider request failed after retries")
    finally:
        if owns_client:
            http.close()


def complete_chat(
    messages: list[dict[str, str]],
    *,
    settings: Settings | None = None,
    client: Any | None = None,
) -> str:
    """Call the configured provider and return assistant text.

    Raises Llm* errors on configuration, timeout, or provider failure.
    Never logs or returns the API key. Identical prompts may be served from
    the in-process cache when caching is enabled.
    """
    cfg = settings or get_settings()
    if not llm_is_configured(cfg):
        raise LlmNotConfiguredError("LLM provider is not configured")

    if cfg.llm_cache_max_entries > 0 and cfg.llm_cache_ttl_seconds > 0:
        configure_cache(
            max_entries=cfg.llm_cache_max_entries,
            ttl_seconds=cfg.llm_cache_ttl_seconds,
        )
        key = cache_key(
            provider=cfg.llm_provider,
            model=cfg.resolved_llm_model(),
            messages=messages,
        )
        cached = get_cached_response(key)
        if cached is not None:
            return cached
    else:
        key = None

    if cfg.llm_provider == "gemini":
        from app.services.llm.gemini import complete_gemini_chat

        text = complete_gemini_chat(messages, settings=cfg, client=client)
    else:
        if client is not None and not isinstance(client, httpx.Client):
            raise LlmProviderError("OpenAI-compatible providers require an httpx.Client")
        text = _complete_openai_compatible(
            messages, settings=cfg, client=client
        )

    if key is not None:
        set_cached_response(key, text)
    return text
