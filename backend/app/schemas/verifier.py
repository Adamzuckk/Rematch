"""Structured input/output models for the standalone Agent 3 verifier."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.decision import EvidenceReferenceSchema, VerificationStatus


class NarrativeClaimInput(BaseModel):
    """A structured claim with references; statement semantics are not inspected."""

    model_config = ConfigDict(extra="forbid")

    id: str
    statement: str
    evidence: list[EvidenceReferenceSchema] = Field(default_factory=list)
    calculation: dict[str, Any] | None = None
    limitations: list[str] = Field(default_factory=list)
    requireFullSupport: bool = False


class NarrativeClaimVerificationResult(BaseModel):
    """Evidence check result with natural-language support explicitly unassessed."""

    model_config = ConfigDict(extra="forbid")

    claimId: str
    submittedStatement: str
    evidenceValidationStatus: VerificationStatus
    claimSupportStatus: Literal["not_assessed"] = "not_assessed"
    reason: str
    evidence: list[EvidenceReferenceSchema]
    limitations: list[str]
    validationMethod: Literal["match_event_evidence_catalog_v1"] = (
        "match_event_evidence_catalog_v1"
    )
    validationScope: Literal[
        "evidence_reference_membership_and_registered_calculation_consistency"
    ] = "evidence_reference_membership_and_registered_calculation_consistency"
