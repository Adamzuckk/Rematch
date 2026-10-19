import type { PitchPoint } from './coordinates'
import type { DataProvenance } from './provenance'

/** Backend MetricStatus */
export type MetricStatus = 'available' | 'unavailable'

/** Backend VerificationStatus */
export type VerificationStatus =
  | 'verified'
  | 'partially_supported'
  | 'unsupported'

/** Backend EvidenceRefKind */
export type EvidenceRefKind =
  | 'event'
  | 'frame'
  | 'calculation'
  | 'player_position'

/** Backend ConfidenceLevel */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none'

/** Backend CompletenessLevel */
export type CompletenessLevel = 'complete' | 'partial' | 'insufficient'

/** Backend ActionKind */
export type ActionKind =
  | 'observed_pass'
  | 'observed_carry'
  | 'observed_shot'
  | 'hypothetical_pass'

export interface MetricValue {
  name: string
  status: MetricStatus
  value: number | null
  unit: string
  formula: string
  inputs: Record<string, unknown>
}

export interface ActionScore {
  actionId: string
  kind: ActionKind
  label: string
  start: PitchPoint | null
  end: PitchPoint | null
  targetPlayerId: string | null
  metrics: MetricValue[]
  compositeScore: number | null
  rankable: boolean
  limitations: string[]
}

export interface RankingEntry {
  rank: number | null
  actionId: string
  kind: ActionKind
  label: string
  compositeScore: number | null
  targetPlayerId: string | null
  rankable: boolean
}

export interface EvidenceReference {
  kind: EvidenceRefKind
  id: string
  matchId: string
  detail: string | null
}

export interface DecisionClaim {
  id: string
  statement: string
  status: VerificationStatus
  evidence: EvidenceReference[]
  reason: string
  limitations: string[]
  calculation: Record<string, unknown> | null
}

export interface DataCompleteness {
  level: CompletenessLevel
  hasCoordinates: boolean
  hasAlignedFrame: boolean
  teammatePositionsInFrame: number
  opponentPositionsInFrame: number
  alternativeCount: number
  missing: string[]
  notes: string[]
}

/**
 * Decision analysis document from
 * GET /api/v1/matches/{matchId}/events/{eventId}/decision-analysis
 */
export interface DecisionAnalysis {
  matchId: string
  eventId: string
  eventType: string
  teamId: string | null
  playerId: string | null
  isHomeTeam: boolean
  scoringMethodId: string
  scoringMethodVersion: string
  scoringAssumptions: string[]
  observed: ActionScore
  alternatives: ActionScore[]
  ranking: RankingEntry[]
  claims: DecisionClaim[]
  completeness: DataCompleteness
  confidence: ConfidenceLevel
  limitations: string[]
  context: Record<string, unknown>
  provenance: DataProvenance
}

/** Optional evidence bundle (same claims catalog; not required for explorer UI). */
export interface EvidenceBundle {
  matchId: string
  eventId: string
  scoringMethodId: string
  claims: DecisionClaim[]
  calculationIds: string[]
  frameIds: string[]
  eventIds: string[]
  limitations: string[]
  provenance: DataProvenance
}
