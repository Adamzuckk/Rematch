"""Focused Agent 3 evidence-validation tests using synthetic catalogs only."""

from app.schemas.verifier import NarrativeClaimInput
from app.services.decision.evidence import EvidenceCatalog
from app.services.verifier import verify_narrative_claims

MATCH_ID = "m-synthetic-verifier"
EVENT_ID = "evt-synthetic-carry"
CALC_ID = "calc:observed:evt-synthetic-carry:composite_score"
SCORE = 34.25


def _catalog() -> EvidenceCatalog:
    return EvidenceCatalog(
        match_id=MATCH_ID,
        event_ids=frozenset({EVENT_ID}),
        frame_ids=frozenset({"frm-synthetic-1"}),
        frame_event_links={"frm-synthetic-1": EVENT_ID},
        player_position_ids=frozenset({"pos-synthetic-1"}),
        calculation_ids=frozenset({CALC_ID}),
        calculation_payloads={
            CALC_ID: {"id": CALC_ID, "value": SCORE, "metric": "composite_score"}
        },
    )


def _claim(
    statement: str = "The registered geometric progression score is 34.25",
    *,
    event_id: str = EVENT_ID,
    calculation_id: str = CALC_ID,
    value: float | None = SCORE,
    with_calculation_reference: bool = True,
) -> NarrativeClaimInput:
    evidence = [{"kind": "event", "id": event_id, "matchId": MATCH_ID}]
    if with_calculation_reference:
        evidence.append(
            {"kind": "calculation", "id": calculation_id, "matchId": MATCH_ID}
        )
    return NarrativeClaimInput(
        id="claim-1",
        statement=statement,
        evidence=evidence,
        calculation={
            "id": calculation_id,
            "value": value,
            "methodId": "geometric_progression_v1",
        },
    )


def test_valid_references_only_report_evidence_validation() -> None:
    (result,) = verify_narrative_claims([_claim()], _catalog())

    assert result.evidenceValidationStatus == "verified"
    assert result.claimSupportStatus == "not_assessed"
    assert result.submittedStatement == "The registered geometric progression score is 34.25"
    assert len(result.evidence) == 2
    assert "do not prove the statement is true" in result.limitations[0]


def test_invalid_evidence_reference_is_unsupported() -> None:
    (result,) = verify_narrative_claims(
        [_claim(event_id="evt-not-in-catalog", with_calculation_reference=False)],
        _catalog(),
    )

    assert result.evidenceValidationStatus == "unsupported"
    assert result.claimSupportStatus == "not_assessed"
    assert "not part of this match" in result.reason


def test_mismatched_registered_calculation_is_unsupported() -> None:
    (result,) = verify_narrative_claims([_claim(value=999.0)], _catalog())

    assert result.evidenceValidationStatus == "unsupported"
    assert "does not match engine result" in result.reason
    assert result.claimSupportStatus == "not_assessed"


def test_false_probability_claim_is_never_semantically_verified() -> None:
    (result,) = verify_narrative_claims(
        [
            _claim(
                "This geometric composite score is the probability of pass success"
            )
        ],
        _catalog(),
    )

    assert result.evidenceValidationStatus == "verified"
    assert result.claimSupportStatus == "not_assessed"
    assert any(
        "not xG or a pass-success probability" in limitation
        for limitation in result.limitations
    )


def test_missing_evidence_is_unsupported_and_truth_remains_unassessed() -> None:
    claim = NarrativeClaimInput(id="empty", statement="An uncheckable claim")

    (result,) = verify_narrative_claims([claim], _catalog())

    assert result.evidenceValidationStatus == "unsupported"
    assert result.reason == "No evidence references were supplied"
    assert result.claimSupportStatus == "not_assessed"
