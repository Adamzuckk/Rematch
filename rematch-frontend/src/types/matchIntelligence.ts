/** Aggregates returned by the backend for one match's seeded event data. */
export interface MatchIntelligenceKeyMoment {
  eventId: string
  type: string
  minute: number | null
  second: number | null
  hasAlignedFrame: boolean
  hasPathMetrics: boolean
  label: string
}

/**
 * `GET /api/v1/matches/{matchId}/intelligence` response.
 *
 * Values are backend-derived aggregates over the supplied synthetic event
 * records. They are not decision-engine scores or live tracking metrics.
 */
export interface MatchIntelligence {
  matchId: string
  provenance: string
  source: string
  eventCounts: Record<string, number>
  totalEvents: number
  eventsWithCoordinates: number
  alignedFrames: number
  pathMetricsPresent: number
  avgBallSpeedMps: number | null
  avgShotSpeedMps: number | null
  avgPassDistanceM: number | null
  keyMoments: MatchIntelligenceKeyMoment[]
  limitations: string[]
}
