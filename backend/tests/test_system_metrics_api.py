"""Integration coverage for append-only operational telemetry."""

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.operational_metric import OperationalMetricEvent
from app.services.operational_metrics import get_system_metrics

NORTHGATE = "m-northgate-riverside-2401"


def _claim_status_counts(claims: list[dict]) -> dict[str, int]:
    return {
        status: sum(claim["status"] == status for claim in claims)
        for status in ("verified", "partially_supported", "unsupported")
    }


def test_system_metrics_are_empty_until_an_instrumented_operation_runs(
    client: TestClient,
) -> None:
    response = client.get("/api/v1/system-metrics", params={"range": "all"})
    assert response.status_code == 200
    body = response.json()
    assert body["operations"] == {
        "attempts": 0,
        "succeeded": 0,
        "failed": 0,
        "successRatePercent": None,
        "averageLatencyMs": None,
        "p95LatencyMs": None,
    }
    assert body["verification"] == {
        "checked": 0,
        "verified": 0,
        "partiallySupported": 0,
        "unsupported": 0,
    }
    assert body["fallbackUsage"]["available"] is False
    assert body["fallbackUsage"]["count"] is None
    # This is a live calculation over the seed, but it is visibly scoped as
    # synthetic catalogue eligibility rather than fabricated telemetry.
    coverage = body["catalogueCoverage"]
    assert coverage["totalEvents"] > 0
    assert 0 <= coverage["eligibleEvents"] <= coverage["totalEvents"]
    assert "synthetic" in coverage["source"]


def test_system_metrics_count_analysis_failures_and_verifier_outcomes(
    client: TestClient,
) -> None:
    analysis = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-ng-pass-12/decision-analysis"
    )
    assert analysis.status_code == 200
    analysis_counts = _claim_status_counts(analysis.json()["claims"])

    failed = client.get(
        f"/api/v1/matches/{NORTHGATE}/events/evt-ng-possession-52/decision-analysis"
    )
    assert failed.status_code == 422

    verification = client.post(
        f"/api/v1/matches/{NORTHGATE}/events/evt-ng-pass-12/decision-analysis/verify",
        json={
            "claims": [
                {
                    "id": "supported",
                    "statement": "Reference membership only",
                    "status": "unsupported",
                    "evidence": [
                        {"kind": "event", "id": "evt-ng-pass-12", "matchId": NORTHGATE}
                    ],
                    "reason": "",
                    "limitations": [],
                    "calculation": None,
                },
                {
                    "id": "missing",
                    "statement": "Missing frame",
                    "status": "unsupported",
                    "evidence": [
                        {"kind": "frame", "id": "not-a-frame", "matchId": NORTHGATE}
                    ],
                    "reason": "",
                    "limitations": [],
                    "calculation": None,
                },
            ]
        },
    )
    assert verification.status_code == 200
    verification_counts = _claim_status_counts(verification.json())

    all_metrics = client.get("/api/v1/system-metrics", params={"range": "all"})
    assert all_metrics.status_code == 200
    body = all_metrics.json()
    assert body["operations"]["attempts"] == 3
    assert body["operations"]["succeeded"] == 2
    assert body["operations"]["failed"] == 1
    assert body["operations"]["successRatePercent"] == 66.7
    assert body["operations"]["averageLatencyMs"] is not None
    assert body["operations"]["p95LatencyMs"] is not None
    assert body["verification"] == {
        "checked": sum(analysis_counts.values()) + sum(verification_counts.values()),
        "verified": analysis_counts["verified"] + verification_counts["verified"],
        "partiallySupported": analysis_counts["partially_supported"] + verification_counts["partially_supported"],
        "unsupported": analysis_counts["unsupported"] + verification_counts["unsupported"],
    }

    analysis_only = client.get(
        "/api/v1/system-metrics", params={"range": "all", "operation": "analysis"}
    )
    assert analysis_only.status_code == 200
    assert analysis_only.json()["operations"]["attempts"] == 2
    assert analysis_only.json()["operations"]["failed"] == 1
    assert analysis_only.json()["verification"] == {
        "checked": sum(analysis_counts.values()),
        "verified": analysis_counts["verified"],
        "partiallySupported": analysis_counts["partially_supported"],
        "unsupported": analysis_counts["unsupported"],
    }


def test_system_metrics_reject_invalid_filters(client: TestClient) -> None:
    response = client.get("/api/v1/system-metrics", params={"range": "forever"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_metric_aggregation_uses_recorded_latency_and_outcome_counts(
    db_session: Session,
) -> None:
    """Keep the averages, P95, and verifier total tied to stored rows."""
    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            OperationalMetricEvent(
                occurred_at=now,
                operation="analysis",
                outcome="success",
                latency_ms=3,
                verified_claims=2,
                partial_claims=1,
                unsupported_claims=0,
            ),
            OperationalMetricEvent(
                occurred_at=now,
                operation="analysis",
                outcome="failure",
                failure_code="insufficient_evidence",
                latency_ms=10,
                verified_claims=0,
                partial_claims=0,
                unsupported_claims=0,
            ),
            OperationalMetricEvent(
                occurred_at=now,
                operation="verification",
                outcome="success",
                latency_ms=40,
                verified_claims=1,
                partial_claims=0,
                unsupported_claims=2,
            ),
        ]
    )
    db_session.commit()

    metrics = get_system_metrics(
        db_session, metric_range="all", operation="all"
    )
    assert metrics.operations.attempts == 3
    assert metrics.operations.succeeded == 2
    assert metrics.operations.failed == 1
    assert metrics.operations.successRatePercent == 66.7
    assert metrics.operations.averageLatencyMs == 18
    assert metrics.operations.p95LatencyMs == 40
    assert metrics.verification.checked == 6
    assert metrics.verification.verified == 3
    assert metrics.verification.partiallySupported == 1
    assert metrics.verification.unsupported == 2
