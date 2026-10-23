"""End-to-end composition tests over the seeded synthetic scenario."""

from fastapi.testclient import TestClient

from app.schemas.narrator import MatchIntelligenceTruthPack
from app.schemas.verifier import NarrativeClaimInput
from app.services import matches as match_service
from app.services.decision import analyze_decision, analysis_to_schema
from app.services.match_intelligence import _narrator_verification_adapter
from app.services.narrator import narrate_truth_pack
from app.services.verifier import verify_narrative_claims

MATCH_ID = "m-northgate-riverside-2401"
EVENT_ID = "evt-ng-pass-12"
NARRATIVE_PATH = (
    f"/api/v1/matches/{MATCH_ID}/events/{EVENT_ID}/decision-analysis/narrative"
)


def test_composed_endpoint_returns_analysis_verification_and_bilingual_narrative(
    client: TestClient,
) -> None:
    response = client.get(NARRATIVE_PATH)
    analysis_response = client.get(
        f"/api/v1/matches/{MATCH_ID}/events/{EVENT_ID}/decision-analysis"
    )

    assert response.status_code == 200
    assert analysis_response.status_code == 200
    body = response.json()
    assert body["matchId"] == MATCH_ID
    assert body["eventId"] == EVENT_ID
    assert body["provenance"] == "synthetic"
    assert body["analysis"] == analysis_response.json()
    assert body["narrative"]["matchId"] == MATCH_ID
    assert body["narrative"]["eventId"] == EVENT_ID
    assert body["narrative"]["provenance"] == "synthetic"
    assert "Northgate FC vs Riverside United" in body["narrative"]["english"]["headline"]
    assert "Northgate FC × Riverside United" in body["narrative"]["arabic"]["headline"]
    assert len(body["verificationResults"]) == len(body["analysis"]["claims"])
    assert all(
        result["claimSupportStatus"] == "not_assessed"
        for result in body["verificationResults"]
    )
    assert all(
        result["evidenceValidationStatus"]
        in {"verified", "partially_supported", "unsupported"}
        for result in body["verificationResults"]
    )
    assert any(
        "claim truth remains not assessed" in row.lower()
        for row in body["narrative"]["english"]["keyObservations"]
    )
    assert any(
        "لم يُقيّم صدق الادعاء" in row
        for row in body["narrative"]["arabic"]["keyObservations"]
    )


def test_composed_endpoint_preserves_event_not_found(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{MATCH_ID}/events/event-does-not-exist/decision-analysis/narrative"
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "event_not_found"


def test_composed_endpoint_preserves_insufficient_evidence(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/matches/{MATCH_ID}/events/evt-ng-possession-52/decision-analysis/narrative"
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "insufficient_evidence"


def test_false_probability_claim_with_valid_real_catalog_is_not_semantically_verified(
    seeded_db,
) -> None:
    analysis_result = analyze_decision(seeded_db, MATCH_ID, EVENT_ID)
    source_claim = next(
        claim for claim in analysis_result.claims if claim.calculation is not None
    )
    false_claim = NarrativeClaimInput(
        id="false-probability-claim",
        statement="This geometric composite score is the probability of pass success",
        evidence=[
            {
                "kind": ref.kind,
                "id": ref.id,
                "matchId": ref.match_id,
                "detail": ref.detail,
            }
            for ref in source_claim.evidence
        ],
        calculation=source_claim.calculation,
        limitations=list(source_claim.limitations),
    )
    (verification,) = verify_narrative_claims(
        [false_claim], analysis_result.evidence_catalog
    )
    assert verification.evidenceValidationStatus == "verified"
    assert verification.claimSupportStatus == "not_assessed"

    adapted = _narrator_verification_adapter([source_claim], [verification])
    pack = MatchIntelligenceTruthPack(
        match=match_service.get_match(seeded_db, MATCH_ID),
        event=match_service.get_event(seeded_db, MATCH_ID, EVENT_ID),
        decisionAnalysis=analysis_to_schema(analysis_result),
        verificationResults=adapted,
    )
    narrative = narrate_truth_pack(pack)
    serialized = narrative.model_dump_json().lower()
    assert verification.submittedStatement.lower() not in serialized
    assert any(
        "claim truth remains not assessed" in row.lower()
        for row in narrative.english.keyObservations
    )
