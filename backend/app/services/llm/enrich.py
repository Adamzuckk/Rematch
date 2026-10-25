"""Optional LLM enrichment of deterministic event intelligence."""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import Settings, get_settings
from app.schemas.event_intelligence import EventIntelligenceSchema
from app.services.llm.client import complete_chat
from app.services.llm.errors import LlmError
from app.services.llm.evidence_pack import build_evidence_pack, evidence_pack_json
from app.services.llm.prompts import SYSTEM_PROMPT, user_prompt
from app.services.llm.status import llm_is_configured
from app.services.llm.validate import validate_llm_briefing

logger = logging.getLogger(__name__)

LLM_ANALYSIS_METHOD = "llm_grounded_event_intelligence_v1"


def _fallback_limitations(
    base: list[str],
    *,
    reason: str,
) -> list[str]:
    note = (
        "External AI enrichment was skipped or failed; "
        f"deterministic evidence briefing retained ({reason})."
    )
    # Drop the static "no external AI" line when we attempted enrichment.
    filtered = [
        row
        for row in base
        if "no external AI provider is connected" not in row.lower()
        and "لا يوجد مزوّد ذكاء اصطناعي" not in row
    ]
    return list(dict.fromkeys([note, *filtered]))


def _success_limitations(english_limitations: list[str], base: list[str]) -> list[str]:
    grounded = (
        "Narrative wording was enriched by an external AI provider using only "
        "verified match evidence; statistics were not invented."
    )
    merged = [grounded, *english_limitations, *base]
    # Remove contradictory disconnected claims.
    cleaned = [
        row
        for row in merged
        if "no external AI provider is connected" not in row.lower()
    ]
    return list(dict.fromkeys(cleaned))[:8]


def enrich_event_intelligence(
    deterministic: EventIntelligenceSchema,
    *,
    settings: Settings | None = None,
    http_client: Any | None = None,
) -> EventIntelligenceSchema:
    """Attempt LLM enrichment; always return a valid briefing.

    On any configuration gap, timeout, provider error, or validation failure,
    returns the deterministic payload with ``llmConnected=False``.
    Sets ``llmConnected=True`` only after a successful grounded enrichment.
    """
    cfg = settings or get_settings()
    if not llm_is_configured(cfg):
        return deterministic.model_copy(update={"llmConnected": False})

    try:
        pack = build_evidence_pack(deterministic)
        evidence_json = evidence_pack_json(deterministic)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt(evidence_json)},
        ]
        raw = complete_chat(messages, settings=cfg, client=http_client)
        briefing = validate_llm_briefing(raw, evidence_pack=pack)

        return deterministic.model_copy(
            update={
                "llmConnected": True,
                "analysisMethod": LLM_ANALYSIS_METHOD,
                "english": briefing.english,
                "arabic": briefing.arabic,
                "limitations": _success_limitations(
                    briefing.english.limitations,
                    deterministic.limitations,
                ),
            }
        )
    except LlmError as exc:
        logger.warning("LLM enrichment failed; using deterministic fallback: %s", exc)
        return deterministic.model_copy(
            update={
                "llmConnected": False,
                "limitations": _fallback_limitations(
                    deterministic.limitations,
                    reason=exc.__class__.__name__,
                ),
            }
        )
    except Exception as exc:  # noqa: BLE001 — never fail the briefing endpoint
        logger.exception("Unexpected LLM enrichment error; deterministic fallback")
        return deterministic.model_copy(
            update={
                "llmConnected": False,
                "limitations": _fallback_limitations(
                    deterministic.limitations,
                    reason=type(exc).__name__,
                ),
            }
        )


def try_enrich(
    deterministic: EventIntelligenceSchema,
    **kwargs: Any,
) -> EventIntelligenceSchema:
    """Alias kept for call sites and tests."""
    return enrich_event_intelligence(deterministic, **kwargs)
