"""Read-only operational telemetry endpoint."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db_dep
from app.schemas.system_metrics import SystemMetricsResponseSchema
from app.services.operational_metrics import get_system_metrics

router = APIRouter(prefix="/system-metrics", tags=["system metrics"])


@router.get("", response_model=SystemMetricsResponseSchema)
def read_system_metrics(
    db: Annotated[Session, Depends(get_db_dep)],
    metric_range: Annotated[
        Literal["24h", "7d", "30d", "all"], Query(alias="range")
    ] = "7d",
    operation: Annotated[
        Literal["all", "analysis", "verification"], Query()
    ] = "all",
) -> SystemMetricsResponseSchema:
    """Return actual recorded run telemetry plus clearly scoped catalogue eligibility."""
    return get_system_metrics(db, metric_range=metric_range, operation=operation)
