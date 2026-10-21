"""Match intelligence aggregates derived only from seeded events/frames."""

from __future__ import annotations

from pydantic import BaseModel, Field


class KeyMomentSchema(BaseModel):
    eventId: str
    type: str
    minute: int | None = None
    second: int | None = None
    hasAlignedFrame: bool = False
    hasPathMetrics: bool = False
    label: str


class MatchIntelligenceSchema(BaseModel):
    matchId: str
    provenance: str = "synthetic"
    source: str = Field(
        default="seeded_events_only",
        description="All figures are counts/averages over stored synthetic events.",
    )
    eventCounts: dict[str, int]
    totalEvents: int
    eventsWithCoordinates: int
    alignedFrames: int
    pathMetricsPresent: int
    avgBallSpeedMps: float | None = None
    avgShotSpeedMps: float | None = None
    avgPassDistanceM: float | None = None
    keyMoments: list[KeyMomentSchema]
    limitations: list[str]
