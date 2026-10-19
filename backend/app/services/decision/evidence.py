"""Evidence verification for decision-analysis claims.

Independent of natural-language generation. Verification only checks that
referenced events, frames, and calculations exist, belong to the match, and
actually support the numerical or structural claim.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

VerificationStatus = Literal["verified", "partially_supported", "unsupported"]
EvidenceRefKind = Literal["event", "frame", "calculation", "player_position"]


@dataclass(frozen=True)
class EvidenceReference:
    kind: EvidenceRefKind
    id: str
    match_id: str
    detail: str | None = None


@dataclass
class Claim:
    id: str
    statement: str
    status: VerificationStatus = "unsupported"
    evidence: list[EvidenceReference] = field(default_factory=list)
    reason: str = ""
    limitations: list[str] = field(default_factory=list)
    calculation: dict[str, Any] | None = None
    # When True, valid evidence only partially establishes the claim (e.g. sparse frame).
    require_full_support: bool = False


@dataclass(frozen=True)
class EvidenceCatalog:
    """Known evidence available for a match/event analysis."""

    match_id: str
    event_ids: frozenset[str]
    frame_ids: frozenset[str]
    frame_event_links: dict[str, str | None]  # frame_id -> event_id
    player_position_ids: frozenset[str]
    calculation_ids: frozenset[str]
    calculation_payloads: dict[str, dict[str, Any]]


def _ref_valid(ref: EvidenceReference, catalog: EvidenceCatalog) -> tuple[bool, str]:
    if ref.match_id != catalog.match_id:
        return False, f"Reference match_id {ref.match_id!r} does not match analysis match"

    if ref.kind == "event":
        if ref.id not in catalog.event_ids:
            return False, f"Event {ref.id!r} is not part of this match"
        return True, "Event exists on this match"

    if ref.kind == "frame":
        if ref.id not in catalog.frame_ids:
            return False, f"Frame {ref.id!r} is not part of this match"
        linked = catalog.frame_event_links.get(ref.id)
        if linked is not None and linked not in catalog.event_ids and linked != "":
            # Linked event must still belong to the match when present.
            if linked not in catalog.event_ids:
                return False, f"Frame {ref.id!r} links to unknown event {linked!r}"
        return True, "Frame exists on this match"

    if ref.kind == "player_position":
        if ref.id not in catalog.player_position_ids:
            return False, f"Player position {ref.id!r} is not in the analysis frame set"
        return True, "Player position exists in a match frame"

    if ref.kind == "calculation":
        if ref.id not in catalog.calculation_ids:
            return False, f"Calculation {ref.id!r} was not produced by the engine"
        return True, "Calculation id is registered for this analysis"

    return False, f"Unknown evidence kind: {ref.kind}"


def verify_claim(claim: Claim, catalog: EvidenceCatalog) -> Claim:
    """Verify a single claim against the evidence catalog (mutates status fields)."""
    if not claim.evidence:
        claim.status = "unsupported"
        claim.reason = "No evidence references were supplied"
        return claim

    valid_notes: list[str] = []
    invalid_notes: list[str] = []
    for ref in claim.evidence:
        ok, note = _ref_valid(ref, catalog)
        if ok:
            valid_notes.append(f"{ref.kind}:{ref.id} — {note}")
        else:
            invalid_notes.append(f"{ref.kind}:{ref.id} — {note}")

    if invalid_notes and not valid_notes:
        claim.status = "unsupported"
        claim.reason = "; ".join(invalid_notes)
        claim.limitations = list(dict.fromkeys([*claim.limitations, *invalid_notes]))
        return claim

    if invalid_notes and valid_notes:
        claim.status = "partially_supported"
        claim.reason = (
            "Some references are valid, but others failed validation: "
            + "; ".join(invalid_notes)
        )
        claim.limitations = list(dict.fromkeys([*claim.limitations, *invalid_notes]))
        return claim

    # All references valid — check calculation payload consistency when present.
    if claim.calculation is not None:
        calc_id = claim.calculation.get("id")
        if not isinstance(calc_id, str) or calc_id not in catalog.calculation_ids:
            claim.status = "partially_supported"
            claim.reason = (
                "Evidence references are valid, but the claimed calculation id "
                "is missing or unregistered"
            )
            return claim

        expected = catalog.calculation_payloads.get(calc_id, {})
        claimed_value = claim.calculation.get("value")
        expected_value = expected.get("value")
        if (
            claimed_value is not None
            and expected_value is not None
            and claimed_value != expected_value
        ):
            claim.status = "unsupported"
            claim.reason = (
                f"Claimed calculation value {claimed_value!r} does not match "
                f"engine result {expected_value!r} for {calc_id}"
            )
            return claim

    if claim.require_full_support:
        claim.status = "partially_supported"
        claim.reason = (
            ("Evidence references are valid, but the claim is only partially "
             "established given stated limitations. ")
            + ("; ".join(valid_notes) if valid_notes else "")
        ).strip()
        return claim

    claim.status = "verified"
    claim.reason = "; ".join(valid_notes) if valid_notes else "Evidence references validated"
    return claim


def verify_claims(claims: list[Claim], catalog: EvidenceCatalog) -> list[Claim]:
    """Verify all claims; returns the same list with updated statuses."""
    return [verify_claim(claim, catalog) for claim in claims]
