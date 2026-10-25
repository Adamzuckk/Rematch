"""LLM provider and grounding validation errors."""

from __future__ import annotations


class LlmError(Exception):
    """Base class for LLM enrichment failures (safe to fall back)."""


class LlmNotConfiguredError(LlmError):
    """Provider settings are missing or disabled."""


class LlmTimeoutError(LlmError):
    """Provider request exceeded the configured timeout."""


class LlmProviderError(LlmError):
    """Provider returned an HTTP or protocol error."""


class LlmRateLimitError(LlmProviderError):
    """Provider rejected the request due to quota or rate limiting."""


class LlmValidationError(LlmError):
    """Model output failed schema or grounding checks."""
