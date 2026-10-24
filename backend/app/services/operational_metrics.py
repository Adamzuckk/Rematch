"""Collection and aggregation of measured API operational telemetry."""

from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Iterable, Literal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.event import MatchEvent
from app.models.operational_metric import OperationalMetricEvent
from app.schemas.system_metrics import (
    CatalogueCoverageSchema,
    FallbackUsageSchema,
    OperationMetricSummarySchema,
    SystemMetricsResponseSchema,
    VerificationOutcomeSummarySchema,
)

logger = logging.getLogger(__name__)

MetricOperation = Literal["analysis", "verification"]
MetricRange = Literal["24h", "7d", "30d", "all"]
MetricOperationFilter = Literal["all", "analysis", "verification"]


def record_operation(
    db: Session,
    *,
    operation: MetricOperation,
    outcome: Literal["success", "failure"],
    latency_ms: int,
    verification_statuses: Iterable[str] = (),
    failure_code: str | None = None,
) -> None:
    """Write one request-level metric without changing the user-facing result.

    Metrics must not turn a successful analysis into a failed request. A
    persistence fault is logged and rolled back; no pretend telemetry is
    returned later.
    """
    statuses = list(verification_statuses)
    row = OperationalMetricEvent(
        occurred_at=datetime.now(timezone.utc),
        operation=operation,
        outcome=outcome,
        failure_code=failure_code,
        latency_ms=max(0, latency_ms),
        verified_claims=statuses.count("verified"),
        partial_claims=statuses.count("partially_supported"),
        unsupported_claims=statuses.count("unsupported"),
    )
    try:
        db.add(row)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Unable to persist ReMatch operational telemetry")


def _period_start(value: MetricRange, now: datetime) -> datetime | None:
    periods = {"24h": timedelta(hours=24), "7d": timedelta(days=7), "30d": timedelta(days=30)}
    duration = periods.get(value)
    return now - duration if duration else None


def _percent(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator * 100, 1) if denominator else None


def _percentile_95(values: list[int]) -> int | None:
    if not values:
        return None
    values.sort()
    return values[math.ceil(len(values) * 0.95) - 1]


def _catalogue_coverage(db: Session) -> CatalogueCoverageSchema:
    total = db.scalar(select(func.count()).select_from(MatchEvent)) or 0
    eligible = db.scalar(
        select(func.count()).select_from(MatchEvent).where(
            or_(
                and_(
                    MatchEvent.type.in_(("pass", "carry")),
                    MatchEvent.start_x.is_not(None),
                    MatchEvent.start_y.is_not(None),
                    MatchEvent.end_x.is_not(None),
                    MatchEvent.end_y.is_not(None),
                ),
                and_(
                    MatchEvent.type == "shot",
                    MatchEvent.location_x.is_not(None),
                    MatchEvent.location_y.is_not(None),
                ),
            )
        )
    ) or 0
    provenances = set(db.scalars(select(MatchEvent.provenance).distinct()).all())
    if not provenances:
        source = "No catalogue events"
        provenance = "unavailable"
    elif len(provenances) == 1:
        provenance = next(iter(provenances))
        source = f"Current catalogue ({provenance} data)"
    else:
        source = "Current catalogue (mixed provenance)"
        provenance = "mixed"
    return CatalogueCoverageSchema(
        source=source,
        provenance=provenance,
        totalEvents=total,
        eligibleEvents=eligible,
        coveragePercent=_percent(eligible, total),
        description=(
            "Events with the event type and coordinates required by the current "
            "geometric decision engine. This is catalogue eligibility, not a "
            "record of analysis requests."
        ),
    )


def get_system_metrics(
    db: Session,
    *,
    metric_range: MetricRange,
    operation: MetricOperationFilter,
) -> SystemMetricsResponseSchema:
    now = datetime.now(timezone.utc)
    conditions = []
    start = _period_start(metric_range, now)
    if start is not None:
        conditions.append(OperationalMetricEvent.occurred_at >= start)
    if operation != "all":
        conditions.append(OperationalMetricEvent.operation == operation)
    rows = db.scalars(
        select(OperationalMetricEvent)
        .where(*conditions)
        .order_by(OperationalMetricEvent.occurred_at.asc(), OperationalMetricEvent.id.asc())
    ).all()
    attempts = len(rows)
    succeeded = sum(row.outcome == "success" for row in rows)
    failed = attempts - succeeded
    latencies = [row.latency_ms for row in rows]
    return SystemMetricsResponseSchema(
        generatedAt=now,
        range=metric_range,
        operation=operation,
        source=(
            "Stored ReMatch operational telemetry. Recording began when this "
            "feature was deployed; it does not include historical requests."
        ),
        operations=OperationMetricSummarySchema(
            attempts=attempts,
            succeeded=succeeded,
            failed=failed,
            successRatePercent=_percent(succeeded, attempts),
            averageLatencyMs=round(sum(latencies) / attempts) if attempts else None,
            p95LatencyMs=_percentile_95(latencies),
        ),
        verification=VerificationOutcomeSummarySchema(
            checked=sum(
                row.verified_claims + row.partial_claims + row.unsupported_claims
                for row in rows
            ),
            verified=sum(row.verified_claims for row in rows),
            partiallySupported=sum(row.partial_claims for row in rows),
            unsupported=sum(row.unsupported_claims for row in rows),
        ),
        fallbackUsage=FallbackUsageSchema(
            reason=(
                "The current deterministic decision engine has no fallback path, "
                "so fallback usage is not a measurable metric."
            )
        ),
        catalogueCoverage=_catalogue_coverage(db),
    )
