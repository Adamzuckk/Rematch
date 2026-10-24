"""Response schemas for real operational telemetry, never synthetic seeds."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class OperationMetricSummarySchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attempts: int = Field(ge=0)
    succeeded: int = Field(ge=0)
    failed: int = Field(ge=0)
    successRatePercent: float | None = Field(default=None, ge=0, le=100)
    averageLatencyMs: int | None = Field(default=None, ge=0)
    p95LatencyMs: int | None = Field(default=None, ge=0)


class VerificationOutcomeSummarySchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    checked: int = Field(ge=0)
    verified: int = Field(ge=0)
    partiallySupported: int = Field(ge=0)
    unsupported: int = Field(ge=0)


class FallbackUsageSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    available: Literal[False] = False
    count: None = None
    reason: str


class CatalogueCoverageSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: str
    provenance: Literal["synthetic", "api", "mixed", "unavailable"]
    totalEvents: int = Field(ge=0)
    eligibleEvents: int = Field(ge=0)
    coveragePercent: float | None = Field(default=None, ge=0, le=100)
    description: str


class SystemMetricsResponseSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    generatedAt: datetime
    range: Literal["24h", "7d", "30d", "all"]
    operation: Literal["all", "analysis", "verification"]
    source: str
    operations: OperationMetricSummarySchema
    verification: VerificationOutcomeSummarySchema
    fallbackUsage: FallbackUsageSchema
    catalogueCoverage: CatalogueCoverageSchema
