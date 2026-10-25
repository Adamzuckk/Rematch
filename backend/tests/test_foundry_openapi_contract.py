import json
import re
from pathlib import Path

from scripts.export_foundry_openapi import build_spec


SPEC_PATH = Path(__file__).resolve().parents[2] / "docs" / "rematch-foundry-openapi.json"
EXPECTED_PATHS = {
    "/api/v1/matches",
    "/api/v1/matches/{match_id}",
    "/api/v1/matches/{match_id}/events",
    "/api/v1/matches/{match_id}/events/{event_id}/decision-analysis",
    "/api/v1/matches/{match_id}/events/{event_id}/decision-analysis/narrative",
    "/api/v1/matches/{match_id}/events/{event_id}/decision-analysis/evidence",
    "/api/v1/matches/{match_id}/events/{event_id}/decision-analysis/verify",
    "/api/v1/matches/{match_id}/events/{event_id}/event-intelligence",
}
VERIFY_PATH = "/api/v1/matches/{match_id}/events/{event_id}/decision-analysis/verify"
NARRATIVE_PATH = "/api/v1/matches/{match_id}/events/{event_id}/decision-analysis/narrative"
EXPECTED_SERVER_URL = "https://rematch.whiteocean-a7603848.eastus.azurecontainerapps.io"


def _refs(value):
    if isinstance(value, dict):
        ref = value.get("$ref")
        if ref:
            yield ref
        for child in value.values():
            yield from _refs(child)
    elif isinstance(value, list):
        for child in value:
            yield from _refs(child)


def test_foundry_spec_is_authenticated_and_self_contained():
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    assert spec["openapi"] == "3.1.0"
    assert set(spec["paths"]) == EXPECTED_PATHS
    assert spec["servers"][0]["url"] == EXPECTED_SERVER_URL
    assert spec["servers"][0]["url"].rstrip("/") == EXPECTED_SERVER_URL
    assert json.dumps(spec).count(EXPECTED_SERVER_URL) == 1
    assert spec["security"] == [{"BearerAuth": []}]
    bearer_scheme = spec["components"]["securitySchemes"]["BearerAuth"]
    assert bearer_scheme["type"] == "apiKey"
    assert bearer_scheme["in"] == "header"
    assert bearer_scheme["name"] == "Authorization"
    assert "Bearer" in bearer_scheme["description"]

    operation_ids = []
    post_operations = []
    for path, path_item in spec["paths"].items():
        expected_methods = {"post"} if path == VERIFY_PATH else {"get"}
        assert set(path_item) == expected_methods
        for method, operation in path_item.items():
            operation_ids.append(operation["operationId"])
            assert re.fullmatch(r"[A-Za-z_-]+", operation["operationId"])
            assert operation["security"] == [{"BearerAuth": []}]
            assert "200" in operation["responses"]
            for parameter in operation.get("parameters", []):
                if parameter["in"] == "path":
                    assert parameter["required"] is True
            if method == "post":
                post_operations.append(operation)
            if path.endswith("decision-analysis"):
                assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("DecisionAnalysisSchema")
            if path == NARRATIVE_PATH:
                assert operation["operationId"] == "get_decision_analysis_narrative"
                assert "claimSupportStatus is always not_assessed" in operation["description"]
                assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("MatchIntelligenceNarrativeResponseSchema")

    assert len(operation_ids) == len(set(operation_ids))
    assert len(post_operations) == 1
    verify = post_operations[0]
    assert verify["operationId"] == "verify_decision_claims"
    assert "evidence references" in verify["description"]
    assert "claimSupportStatus is always not_assessed" in verify["description"]
    assert "not xG or a pass-success probability" in verify["description"]
    assert verify["requestBody"]["required"] is True
    assert verify["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith("ClaimVerificationRequest")
    response_schema = verify["responses"]["200"]["content"]["application/json"]["schema"]
    assert response_schema["type"] == "array"
    assert response_schema["items"]["$ref"].endswith("ClaimVerificationResponseSchema")
    response_properties = spec["components"]["schemas"]["ClaimVerificationResponseSchema"]["properties"]
    assert {
        "status",
        "evidenceValidationStatus",
        "claimSupportStatus",
        "validationMethod",
        "validationScope",
        "limitations",
    } <= set(response_properties)
    assert response_properties["claimSupportStatus"]["const"] == "not_assessed"
    request_schema = spec["components"]["schemas"]["ClaimVerificationRequest"]
    assert request_schema["properties"]["claims"]["type"] == "array"
    assert request_schema["properties"]["claims"]["items"]["$ref"].endswith("ClaimSchema")
    for ref in _refs(spec["paths"]):
        assert ref.startswith("#/components/schemas/")
        assert ref.removeprefix("#/components/schemas/") in spec["components"]["schemas"]
    for ref in _refs(spec["components"]["schemas"]):
        assert ref.startswith("#/components/schemas/")
        assert ref.removeprefix("#/components/schemas/") in spec["components"]["schemas"]

    decision_schema = spec["components"]["schemas"]["DecisionAnalysisSchema"]["properties"]
    assert {"scoringMethodId", "scoringMethodVersion", "observed", "alternatives", "claims", "provenance"} <= set(decision_schema)


def test_exporter_includes_only_the_claim_validation_post():
    spec = build_spec()
    verify = spec["paths"][VERIFY_PATH]["post"]

    assert set(spec["paths"]) == EXPECTED_PATHS
    assert [
        (path, method)
        for path, path_item in spec["paths"].items()
        for method in path_item
        if method == "post"
    ] == [(VERIFY_PATH, "post")]
    assert verify["operationId"] == "verify_decision_claims"
    assert verify["requestBody"]["required"] is True
    assert verify["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith("ClaimVerificationRequest")
    response_schema = verify["responses"]["200"]["content"]["application/json"]["schema"]
    assert response_schema["type"] == "array"
    assert response_schema["items"]["$ref"].endswith("ClaimVerificationResponseSchema")
    assert verify["security"] == [{"BearerAuth": []}]

    narrative = spec["paths"][NARRATIVE_PATH]["get"]
    assert narrative["operationId"] == "get_decision_analysis_narrative"
    assert "claimSupportStatus is always not_assessed" in narrative["description"]
    assert narrative["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("MatchIntelligenceNarrativeResponseSchema")
    assert narrative["security"] == [{"BearerAuth": []}]
