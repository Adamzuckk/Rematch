"""Evidence verification unit tests."""

from __future__ import annotations

from app.services.decision.evidence import (
    Claim,
    EvidenceCatalog,
    EvidenceReference,
    verify_claim,
    verify_claims,
)


def _catalog() -> EvidenceCatalog:
    return EvidenceCatalog(
        match_id="m-northgate-riverside-2401",
        event_ids=frozenset({"evt-ng-pass-12", "evt-ng-carry-64"}),
        frame_ids=frozenset({"frm-ng-12", "frm-ng-64"}),
        frame_event_links={"frm-ng-12": "evt-ng-pass-12", "frm-ng-64": "evt-ng-carry-64"},
        player_position_ids=frozenset({"frm-ng-12-p-ng8", "frm-ng-64-p-ng9"}),
        calculation_ids=frozenset({"calc:observed:evt-ng-pass-12:composite_score"}),
        calculation_payloads={
            "calc:observed:evt-ng-pass-12:composite_score": {
                "id": "calc:observed:evt-ng-pass-12:composite_score",
                "value": 30.35,
                "unit": "pitch_percent",
            }
        },
    )


def test_verified_claim_with_matching_calculation() -> None:
    catalog = _catalog()
    claim = Claim(
        id="c1",
        statement="Observed pass composite is 30.35",
        evidence=[
            EvidenceReference(
                kind="event",
                id="evt-ng-pass-12",
                match_id="m-northgate-riverside-2401",
            ),
            EvidenceReference(
                kind="calculation",
                id="calc:observed:evt-ng-pass-12:composite_score",
                match_id="m-northgate-riverside-2401",
            ),
        ],
        calculation={
            "id": "calc:observed:evt-ng-pass-12:composite_score",
            "value": 30.35,
        },
    )
    result = verify_claim(claim, catalog)
    assert result.status == "verified"


def test_unsupported_when_no_evidence() -> None:
    claim = Claim(id="c2", statement="Open lanes everywhere", evidence=[])
    result = verify_claim(claim, _catalog())
    assert result.status == "unsupported"
    assert "No evidence" in result.reason


def test_unsupported_wrong_match_reference() -> None:
    claim = Claim(
        id="c3",
        statement="Uses foreign event",
        evidence=[
            EvidenceReference(
                kind="event",
                id="evt-ng-pass-12",
                match_id="m-other-match",
            )
        ],
    )
    result = verify_claim(claim, _catalog())
    assert result.status == "unsupported"


def test_unsupported_unknown_event_id() -> None:
    claim = Claim(
        id="c4",
        statement="Invented event",
        evidence=[
            EvidenceReference(
                kind="event",
                id="evt-does-not-exist",
                match_id="m-northgate-riverside-2401",
            )
        ],
    )
    result = verify_claim(claim, _catalog())
    assert result.status == "unsupported"


def test_partially_supported_mixed_refs() -> None:
    claim = Claim(
        id="c5",
        statement="Mixed refs",
        evidence=[
            EvidenceReference(
                kind="event",
                id="evt-ng-pass-12",
                match_id="m-northgate-riverside-2401",
            ),
            EvidenceReference(
                kind="frame",
                id="frm-missing",
                match_id="m-northgate-riverside-2401",
            ),
        ],
    )
    result = verify_claim(claim, _catalog())
    assert result.status == "partially_supported"


def test_partially_supported_require_full_support() -> None:
    claim = Claim(
        id="c6",
        statement="All teammates evaluated",
        evidence=[
            EvidenceReference(
                kind="frame",
                id="frm-ng-12",
                match_id="m-northgate-riverside-2401",
            )
        ],
        limitations=["Sparse frame"],
        require_full_support=True,
    )
    result = verify_claim(claim, _catalog())
    assert result.status == "partially_supported"


def test_unsupported_calculation_value_mismatch() -> None:
    claim = Claim(
        id="c7",
        statement="Wrong value",
        evidence=[
            EvidenceReference(
                kind="calculation",
                id="calc:observed:evt-ng-pass-12:composite_score",
                match_id="m-northgate-riverside-2401",
            )
        ],
        calculation={
            "id": "calc:observed:evt-ng-pass-12:composite_score",
            "value": 999.0,
        },
    )
    result = verify_claim(claim, _catalog())
    assert result.status == "unsupported"
    assert "does not match" in result.reason


def test_verify_claims_batch() -> None:
    catalog = _catalog()
    claims = [
        Claim(id="a", statement="none", evidence=[]),
        Claim(
            id="b",
            statement="ok",
            evidence=[
                EvidenceReference(
                    kind="event",
                    id="evt-ng-pass-12",
                    match_id="m-northgate-riverside-2401",
                )
            ],
        ),
    ]
    out = verify_claims(claims, catalog)
    assert out[0].status == "unsupported"
    assert out[1].status == "verified"
