"""Google Gemini Developer API client via the official google-genai SDK."""

from __future__ import annotations

import logging
import time
from typing import Any

from app.core.config import Settings, get_settings
from app.services.llm.errors import (
    LlmNotConfiguredError,
    LlmProviderError,
    LlmRateLimitError,
    LlmTimeoutError,
)
from app.services.llm.status import llm_is_configured

logger = logging.getLogger(__name__)

# Transient HTTP statuses worth a bounded retry.
_RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}


def _messages_to_gemini_contents(
    messages: list[dict[str, str]],
) -> tuple[str | None, list[str]]:
    """Split OpenAI-style messages into system instruction + user contents."""
    system_parts: list[str] = []
    user_parts: list[str] = []
    for row in messages:
        role = (row.get("role") or "user").strip().lower()
        content = (row.get("content") or "").strip()
        if not content:
            continue
        if role == "system":
            system_parts.append(content)
        elif role == "assistant":
            user_parts.append(f"Assistant draft (do not invent beyond evidence):\n{content}")
        else:
            user_parts.append(content)
    system_instruction = "\n\n".join(system_parts) if system_parts else None
    if not user_parts:
        user_parts = ["Produce the bilingual JSON briefing now."]
    return system_instruction, user_parts


def _map_gemini_exception(exc: BaseException, *, timeout_seconds: float) -> LlmProviderError:
    """Map google-genai / httpx failures to Rematch LLM errors without leaking secrets."""
    try:
        from google.genai import errors as genai_errors
    except ImportError:  # pragma: no cover — dependency is required in pyproject
        genai_errors = None  # type: ignore[assignment]

    if isinstance(exc, TimeoutError):
        return LlmTimeoutError(f"Gemini timed out after {timeout_seconds:g}s")

    # httpx timeouts may surface wrapped.
    name = exc.__class__.__name__
    if "Timeout" in name or "timeout" in str(exc).lower():
        return LlmTimeoutError(f"Gemini timed out after {timeout_seconds:g}s")

    if genai_errors is not None and isinstance(exc, genai_errors.APIError):
        code = int(getattr(exc, "code", 0) or 0)
        if code == 429:
            return LlmRateLimitError("Gemini rate limit or quota exceeded (HTTP 429)")
        if code in {401, 403}:
            return LlmProviderError(f"Gemini authentication failed (HTTP {code})")
        return LlmProviderError(f"Gemini returned HTTP {code or 'error'}")

    return LlmProviderError(f"Gemini request failed: {exc.__class__.__name__}")


def complete_gemini_chat(
    messages: list[dict[str, str]],
    *,
    settings: Settings | None = None,
    client: Any | None = None,
) -> str:
    """Call Gemini generate_content and return assistant text.

    Never logs or returns the API key. Raises Llm* errors on failure.
    """
    cfg = settings or get_settings()
    if not llm_is_configured(cfg) or cfg.llm_provider != "gemini":
        raise LlmNotConfiguredError("Gemini provider is not configured")

    api_key = cfg.resolved_llm_api_key()
    if not api_key:
        raise LlmNotConfiguredError("GEMINI_API_KEY is not configured")

    model = cfg.resolved_llm_model()
    system_instruction, user_parts = _messages_to_gemini_contents(messages)
    timeout_ms = max(1, int(cfg.llm_timeout_seconds * 1000))
    max_attempts = 1 + max(0, cfg.llm_max_retries)

    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:  # pragma: no cover
        raise LlmProviderError("google-genai SDK is not installed") from exc

    owns_client = client is None
    if client is None:
        http_options = types.HttpOptions(
            timeout=timeout_ms,
            retry_options=types.HttpRetryOptions(
                attempts=1,  # we own the retry loop below
                http_status_codes=[],
            ),
        )
        client = genai.Client(api_key=api_key, http_options=http_options)

    config_kwargs: dict[str, Any] = {
        "temperature": 0.2,
        "max_output_tokens": cfg.llm_max_tokens,
        "response_mime_type": "application/json",
    }
    if system_instruction:
        config_kwargs["system_instruction"] = system_instruction
    generate_config = types.GenerateContentConfig(**config_kwargs)

    contents: Any = user_parts[0] if len(user_parts) == 1 else user_parts
    last_error: LlmProviderError | None = None

    try:
        for attempt in range(max_attempts):
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=generate_config,
                )
            except Exception as exc:  # noqa: BLE001 — map then retry/raise
                mapped = _map_gemini_exception(exc, timeout_seconds=cfg.llm_timeout_seconds)
                last_error = mapped
                retryable = isinstance(mapped, (LlmRateLimitError, LlmTimeoutError)) or (
                    isinstance(mapped, LlmProviderError)
                    and any(str(code) in str(mapped) for code in _RETRYABLE_STATUS)
                )
                if retryable and attempt + 1 < max_attempts:
                    # Short backoff; never log secrets.
                    time.sleep(min(2.0, 0.25 * (2**attempt)))
                    continue
                raise mapped from exc

            text = getattr(response, "text", None)
            if not isinstance(text, str) or not text.strip():
                # Some SDK responses expose candidates instead of .text
                try:
                    candidates = getattr(response, "candidates", None) or []
                    parts = []
                    for candidate in candidates:
                        content = getattr(candidate, "content", None)
                        for part in getattr(content, "parts", None) or []:
                            part_text = getattr(part, "text", None)
                            if isinstance(part_text, str) and part_text.strip():
                                parts.append(part_text)
                    text = "\n".join(parts) if parts else None
                except Exception:  # noqa: BLE001
                    text = None

            if not isinstance(text, str) or not text.strip():
                raise LlmProviderError("Gemini returned empty content")
            return text

        assert last_error is not None
        raise last_error
    finally:
        if owns_client:
            close = getattr(client, "close", None)
            if callable(close):
                try:
                    close()
                except Exception:  # noqa: BLE001 — ignore close failures
                    logger.debug("Gemini client close failed", exc_info=True)
