"""Export the selected Foundry tool contract from the FastAPI application's OpenAPI."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI

from app import __version__
from app.api.router import api_router

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs" / "rematch-foundry-openapi.json"
SERVER_URL = "https://rematch.whiteocean-a7603848.eastus.azurecontainerapps.io"
SELECTED_PATHS = (
    "/api/v1/matches",
    "/api/v1/matches/{match_id}",
    "/api/v1/matches/{match_id}/events",
    "/api/v1/matches/{match_id}/events/{event_id}/decision-analysis",
    "/api/v1/matches/{match_id}/events/{event_id}/decision-analysis/narrative",
    "/api/v1/matches/{match_id}/events/{event_id}/decision-analysis/evidence",
    "/api/v1/matches/{match_id}/events/{event_id}/decision-analysis/verify",
    "/api/v1/matches/{match_id}/events/{event_id}/event-intelligence",
)
OPERATIONS = {
    ("/api/v1/matches", "get"): (
        "list_matches",
        "Discover available matches. Use the returned IDs and provenance as the source of truth; follow pagination when additional matches are relevant.",
    ),
    ("/api/v1/matches/{match_id}", "get"): (
        "get_match",
        "Fetch a known match by ID. Use this to confirm the selected match, its teams, status, synthetic provenance, and scenario before analyzing an event.",
    ),
    ("/api/v1/matches/{match_id}/events", "get"): (
        "list_match_events",
        "List events for a known match to discover valid event IDs. Follow the returned pagination fields when there are more events than the page contains. Use event IDs from this response for decision analysis.",
    ),
    ("/api/v1/matches/{match_id}/events/{event_id}/decision-analysis", "get"): (
        "get_decision_analysis",
        "Get the backend's analysis for an observed match event. Preserve returned scoring method ID and version, scores, ranks, provenance, limitations, and verified claim statuses. Scores are geometric estimates, not probabilities or proof of the best real-world decision.",
    ),
    ("/api/v1/matches/{match_id}/events/{event_id}/decision-analysis/narrative", "get"): (
        "get_decision_analysis_narrative",
        "Return one backend decision analysis, its evidence/reference validation results, and the deterministic English and Arabic narrative. evidenceValidationStatus reflects reference/calculation checks only; claimSupportStatus is always not_assessed. This operation does not verify natural-language truth. geometric_progression_v1 is not xG or a pass-success probability.",
    ),
    ("/api/v1/matches/{match_id}/events/{event_id}/decision-analysis/evidence", "get"): (
        "get_decision_evidence",
        "Fetch the registered evidence bundle for a decision analysis, including claims, evidence references, calculation IDs, frame IDs, event IDs, limitations, and provenance. Report missing evidence explicitly.",
    ),
    ("/api/v1/matches/{match_id}/events/{event_id}/decision-analysis/verify", "post"): (
        "verify_decision_claims",
        "Validate submitted evidence references and registered calculation values against the selected match/event evidence. The legacy status and evidenceValidationStatus report this validation only; claimSupportStatus is always not_assessed because natural-language truth is not evaluated. Valid references do not prove the statement true. geometric_progression_v1 is not xG or a pass-success probability.",
    ),
    ("/api/v1/matches/{match_id}/events/{event_id}/event-intelligence", "get"): (
        "get_event_intelligence",
        "Return a bilingual evidence-grounded briefing for any stored match event. Distinguishes verified facts, calculated metrics, and hypotheses. Uses deterministic templates with optional server-side LLM enrichment when configured. llmConnected is true only after a successful validated provider call; never invent players, assists, or causal links absent from the record.",
    ),
}


def _local_ref_names(value: Any) -> set[str]:
    refs: set[str] = set()
    if isinstance(value, dict):
        ref = value.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/components/schemas/"):
            refs.add(ref.removeprefix("#/components/schemas/"))
        for child in value.values():
            refs.update(_local_ref_names(child))
    elif isinstance(value, list):
        for child in value:
            refs.update(_local_ref_names(child))
    return refs


def build_spec() -> dict[str, Any]:
    # Build the schema from the API router directly so exporting a public
    # contract does not load local .env credentials as app.main does.
    source_app = FastAPI(
        title="ReMatch API",
        version=__version__,
        description=(
            "ReMatch API — seeded synthetic match catalogue, events, frames, "
            "and deterministic decision analysis with evidence verification. "
            "Optional server-side LLM enrichment for event briefings when configured; "
            "synthetic demo data only."
        ),
    )
    source_app.include_router(api_router)
    source = source_app.openapi()
    paths: dict[str, Any] = {}
    for path in SELECTED_PATHS:
        if path not in source["paths"]:
            raise RuntimeError(f"Expected FastAPI route missing from OpenAPI: {path}")
        paths[path] = {}
        for method, operation in source["paths"][path].items():
            if method.lower() not in {"get", "post", "parameters"}:
                continue
            if method.lower() == "parameters":
                paths[path][method] = operation
                continue
            op_id, description = OPERATIONS[(path, method.lower())]
            operation["operationId"] = op_id
            operation["description"] = description
            operation.pop("summary", None)
            paths[path][method] = operation

    schemas = source.get("components", {}).get("schemas", {})
    needed: set[str] = set()
    pending = list(_local_ref_names(paths))
    while pending:
        name = pending.pop()
        if name in needed:
            continue
        if name not in schemas:
            raise RuntimeError(f"OpenAPI refers to missing schema component: {name}")
        needed.add(name)
        pending.extend(_local_ref_names(schemas[name]) - needed)

    # Retain only schema components used by the selected operations.
    spec = {
        "openapi": "3.1.0",
        "info": {
            "title": "ReMatch Match Intelligence API",
            "version": source["info"]["version"],
            "description": "Tool contract derived from the ReMatch FastAPI application. It exposes read-only match and decision data plus a non-persisting claim evidence/reference validation operation. Match and event data currently shipped with the API is synthetic.",
        },
        "servers": [
            {
                "url": SERVER_URL,
                "description": (
                    "Live Azure Container Apps backend (East US). "
                    "Requires Authorization: Bearer <API_BEARER_TOKEN>."
                ),
            }
        ],
        "paths": paths,
        "components": {
            "schemas": {name: schemas[name] for name in sorted(needed)},
            "securitySchemes": source["components"]["securitySchemes"],
        },
        "security": [{"BearerAuth": []}],
    }

    operation_ids = [
        operation["operationId"]
        for path_item in spec["paths"].values()
        for operation in path_item.values()
        if isinstance(operation, dict) and "operationId" in operation
    ]
    if len(operation_ids) != len(set(operation_ids)):
        raise RuntimeError("operationId values must be unique")
    if any(re.fullmatch(r"[A-Za-z_-]+", operation_id) is None for operation_id in operation_ids):
        raise RuntimeError("Foundry operationId values may contain only letters, _ and -")
    return spec


if __name__ == "__main__":
    OUTPUT.write_text(json.dumps(build_spec(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")
