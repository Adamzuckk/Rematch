export type MetricsRange = '24h' | '7d' | '30d' | 'all'
export type MetricsOperation = 'all' | 'analysis' | 'verification'

export interface OperationMetricSummary {
  attempts: number
  succeeded: number
  failed: number
  successRatePercent: number | null
  averageLatencyMs: number | null
  p95LatencyMs: number | null
}

export interface VerificationOutcomeSummary {
  checked: number
  verified: number
  partiallySupported: number
  unsupported: number
}

export interface FallbackUsage {
  available: false
  count: null
  reason: string
}

export interface CatalogueCoverage {
  source: string
  provenance: 'synthetic' | 'api' | 'mixed' | 'unavailable'
  totalEvents: number
  eligibleEvents: number
  coveragePercent: number | null
  description: string
}

/** Real backend telemetry. Synthetic match seeds never populate this shape. */
export interface SystemMetrics {
  generatedAt: string
  range: MetricsRange
  operation: MetricsOperation
  source: string
  operations: OperationMetricSummary
  verification: VerificationOutcomeSummary
  fallbackUsage: FallbackUsage
  catalogueCoverage: CatalogueCoverage
}
