"""Validate and ground LLM briefing output against the verified evidence pack."""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import ValidationError

from app.schemas.narrator import LocalizedNarrative
from app.services.llm.errors import LlmValidationError
from app.services.llm.evidence_pack import allowed_number_tokens, evidence_text_blob

_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")
_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)

# Phrases that invent unsupported statistical products when asserted positively.
_FORBIDDEN_EN = re.compile(
    r"\b(xG|expected goals|xT|expected threat|pass[- ]success probability|"
    r"packing rate|official statistics)\b",
    re.IGNORECASE,
)
# Avoid matching disclaimers such as "ليست إحصاءات رسمية".
_FORBIDDEN_AR = re.compile(
    r"(توقعات الأهداف|احتمال نجاح التمريرة|هذه إحصاءات رسمية|وفق الإحصاءات الرسمية)",
)
# Negation window immediately before a forbidden English phrase (disclaimers).
_EN_NEGATION_BEFORE = re.compile(
    r"\b(not|never|no|isn't|is not|are not|aren't|without|unlike)\b[\w\s\-—,–:'\"]*$",
    re.IGNORECASE,
)


class LlmBriefingPayload:
    """Validated bilingual narratives from the model."""

    __slots__ = ("english", "arabic")

    def __init__(self, english: LocalizedNarrative, arabic: LocalizedNarrative) -> None:
        self.english = english
        self.arabic = arabic


def _strip_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = _FENCE_RE.sub("", text).strip()
    return text


def _parse_json_object(raw: str) -> dict[str, Any]:
    text = _strip_fences(raw)
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LlmValidationError("LLM output is not valid JSON") from exc
    if not isinstance(data, dict):
        raise LlmValidationError("LLM output must be a JSON object")
    return data


def _as_localized(block: Any, *, lang: str) -> LocalizedNarrative:
    if not isinstance(block, dict):
        raise LlmValidationError(f"LLM {lang} block must be an object")
    try:
        narrative = LocalizedNarrative.model_validate(
            {
                "headline": block.get("headline"),
                "keyObservations": block.get("keyObservations") or [],
                "limitations": block.get("limitations") or [],
                "whatHappened": block.get("whatHappened") or [],
                "whyItMattered": block.get("whyItMattered") or [],
                "whatCouldHaveHappened": block.get("whatCouldHaveHappened") or [],
                "analysisMethod": "llm_grounded_event_intelligence_v1",
            }
        )
    except ValidationError as exc:
        raise LlmValidationError(f"LLM {lang} narrative failed schema validation") from exc

    if not narrative.headline.strip():
        raise LlmValidationError(f"LLM {lang} headline is empty")
    if not narrative.whatHappened:
        raise LlmValidationError(f"LLM {lang} whatHappened is empty")
    return narrative


def _collect_text(narrative: LocalizedNarrative) -> str:
    parts = [
        narrative.headline,
        *narrative.keyObservations,
        *narrative.limitations,
        *narrative.whatHappened,
        *narrative.whyItMattered,
        *narrative.whatCouldHaveHappened,
    ]
    return "\n".join(parts)


def _token_candidates(token: str) -> set[str]:
    """Normalize trailing zeros: 12.0 vs 12."""
    candidates = {token}
    if "." in token:
        candidates.add(token.rstrip("0").rstrip("."))
    else:
        candidates.add(f"{token}.0")
    return candidates


def _is_rounding_of_allowed(token: str, allowed: set[str]) -> bool:
    """Accept readable rounding of an evidence float (e.g. 20.237 from 20.23716…).

    Integer tokens must still appear exactly in the evidence set so the model
    cannot collapse 20.237 into an unverified bare ``20``.
    """
    if "." not in token:
        return False
    try:
        value = float(token)
    except ValueError:
        return False
    decimals = len(token.split(".", 1)[1])
    if decimals == 0 or decimals > 12:
        return False
    tolerance = (10 ** (-decimals)) * 0.51 + 1e-12
    for allowed_token in allowed:
        try:
            allowed_val = float(allowed_token)
        except ValueError:
            continue
        if abs(round(allowed_val, decimals) - value) <= tolerance:
            return True
    return False


def _assert_numbers_grounded(text: str, allowed: set[str]) -> None:
    for token in _NUMBER_RE.findall(text):
        candidates = _token_candidates(token)
        if candidates.intersection(allowed):
            continue
        if _is_rounding_of_allowed(token, allowed):
            continue
        raise LlmValidationError(
            f"LLM output contains unverified number '{token}'"
        )


def _assert_no_forbidden_claims(english: str, arabic: str) -> None:
    for match in _FORBIDDEN_EN.finditer(english):
        window = english[max(0, match.start() - 40) : match.start()]
        if _EN_NEGATION_BEFORE.search(window):
            continue
        raise LlmValidationError("LLM English output uses forbidden statistical claims")
    if _FORBIDDEN_AR.search(arabic):
        raise LlmValidationError("LLM Arabic output uses forbidden statistical claims")


# Title-case English words that often appear in briefings but are not player names.
_TITLE_CASE_STOPWORDS = {
    "pass",
    "analysis",
    "match",
    "event",
    "briefing",
    "hypothesis",
    "geometric",
    "progression",
    "composite",
    "score",
    "minute",
    "recorded",
    "observed",
    "action",
    "moment",
    "decision",
    "alternative",
    "synthetic",
    "demo",
    "data",
    "official",
    "statistics",
    "nearest",
    "opponent",
    "distance",
    "goal",
    "proximity",
    "gain",
    "home",
    "away",
    "team",
    "primary",
    "player",
    "complete",
    "completed",
    "carry",
    "shot",
    "frame",
    "aligned",
    "evidence",
    "limitation",
    "limitations",
    "key",
    "observations",
    "what",
    "happened",
    "mattered",
    "could",
    "have",
    "for",
    "the",
    "and",
    "with",
    "from",
    "into",
    "over",
    "under",
    "versus",
    "vs",
}


def _assert_player_tokens_grounded(text: str, evidence_blob: str) -> None:
    """Reject likely proper names that never appear in the evidence pack.

    Uses a conservative heuristic: multi-word Title Case tokens (English names).
    Skips common briefing vocabulary so phrases like "Pass Analysis" are not
    treated as people. Does not attempt full NER.
    """
    # English-style "First Last" names
    for match in re.finditer(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b", text):
        name = match.group(1)
        parts = name.split()
        if any(part.lower() in _TITLE_CASE_STOPWORDS for part in parts):
            continue
        if name.lower() not in evidence_blob and name not in evidence_blob:
            # Allow if each part appears (evidence may list "First" separately)
            if not all(part.lower() in evidence_blob for part in parts):
                raise LlmValidationError(
                    f"LLM output mentions unverified name '{name}'"
                )


def validate_llm_briefing(
    raw: str,
    *,
    evidence_pack: dict[str, Any],
) -> LlmBriefingPayload:
    """Parse, schema-validate, and ground-check model output."""
    data = _parse_json_object(raw)
    english = _as_localized(data.get("english"), lang="english")
    arabic = _as_localized(data.get("arabic"), lang="arabic")

    en_text = _collect_text(english)
    ar_text = _collect_text(arabic)
    allowed = allowed_number_tokens(evidence_pack)
    blob = evidence_text_blob(evidence_pack)

    _assert_numbers_grounded(en_text, allowed)
    _assert_numbers_grounded(ar_text, allowed)
    _assert_no_forbidden_claims(en_text, ar_text)
    _assert_player_tokens_grounded(en_text, blob)

    # Keep hypothesis content out of whatHappened when the model copies metric lines.
    # Soft check: whatHappened must not be empty after filter — already enforced.

    return LlmBriefingPayload(english=english, arabic=arabic)
