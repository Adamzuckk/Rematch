"""Build the verified evidence JSON supplied to the model — nothing invented."""

from __future__ import annotations

import json
import re
from typing import Any

from app.schemas.event_intelligence import EventIntelligenceSchema

# Numbers that commonly appear in list formatting and are not match statistics.
_TRIVIAL_NUMBERS = {str(i) for i in range(0, 11)}


def build_evidence_pack(deterministic: EventIntelligenceSchema) -> dict[str, Any]:
    """Serialize only verified statements and recorded decision metrics."""
    pack: dict[str, Any] = {
        "matchId": deterministic.matchId,
        "eventId": deterministic.eventId,
        "eventType": deterministic.eventType,
        "provenance": deterministic.provenance,
        "decisionCandidate": deterministic.decisionCandidate,
        "missingEvidence": list(deterministic.missingEvidence),
        "statements": [
            {
                "tier": item.tier,
                "english": item.english,
                "arabic": item.arabic,
            }
            for item in deterministic.statements
        ],
        "instructions": {
            "facts": "Use only statements with tier=fact as established events.",
            "metrics": (
                "Use only statements with tier=metric as calculated geometry; "
                "never relabel them as xG, probability, or official statistics."
            ),
            "hypotheses": (
                "Statements with tier=hypothesis are speculative alternatives only; "
                "keep them in whatCouldHaveHappened and mark them as hypotheses."
            ),
            "missing": (
                "Statements with tier=missing and missingEvidence list gaps; "
                "do not invent values to fill them."
            ),
        },
    }

    analysis = deterministic.decisionAnalysis
    if analysis is not None:
        observed = analysis.observed
        pack["decisionGeometry"] = {
            "scoringMethodId": analysis.scoringMethodId,
            "scoringMethodVersion": analysis.scoringMethodVersion,
            "completeness": analysis.completeness.level,
            "confidence": analysis.confidence,
            "observed": {
                "actionId": observed.actionId,
                "kind": observed.kind,
                "label": observed.label,
                "compositeScore": observed.compositeScore,
                "rankable": observed.rankable,
                "metrics": [
                    {
                        "name": m.name,
                        "status": m.status,
                        "value": m.value,
                        "unit": m.unit,
                    }
                    for m in observed.metrics
                    if m.status == "available" and m.value is not None
                ],
            },
            "ranking": [
                {
                    "rank": entry.rank,
                    "actionId": entry.actionId,
                    "kind": entry.kind,
                    "label": entry.label,
                    "compositeScore": entry.compositeScore,
                    "rankable": entry.rankable,
                }
                for entry in analysis.ranking
            ],
            "limitations": list(analysis.limitations),
        }
    return pack


def evidence_pack_json(deterministic: EventIntelligenceSchema) -> str:
    return json.dumps(build_evidence_pack(deterministic), ensure_ascii=False, indent=2)


def allowed_number_tokens(pack: dict[str, Any]) -> set[str]:
    """Collect numeric tokens present in the verified pack (for grounding checks)."""
    blob = json.dumps(pack, ensure_ascii=False)
    tokens = set(re.findall(r"-?\d+(?:\.\d+)?", blob))
    tokens |= _TRIVIAL_NUMBERS
    return tokens


def evidence_text_blob(pack: dict[str, Any]) -> str:
    return json.dumps(pack, ensure_ascii=False).lower()
