import type { PitchPoint } from './coordinates'
import type { DataProvenance } from './provenance'

/** Backend MetricStatus */
export type MetricStatus = 'available' | 'unavailable'

/** Backend VerificationStatus */
export type VerificationStatus =
  | 'verified'
  | 'partially_supported'
  | 'unsupported'

/** The backend does not assess whether natural-language claim wording is true. */
export type ClaimSupportStatus = 'not_assessed'

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

/** One deterministic English or Arabic narrative returned by the backend. */
export interface LocalizedNarrative {
  headline: string
  keyObservations: string[]
  limitations: string[]
  /** Progressive-disclosure sections (empty when not composed). */
  whatHappened?: string[]
  whyItMattered?: string[]
  whatCouldHaveHappened?: string[]
  analysisMethod?: string
}

/** Bilingual deterministic narrative payload nested in the composed response. */
export interface NarratorOutput {
  matchId: string | null
  eventId: string | null
  provenance: DataProvenance | null
  english: LocalizedNarrative
  arabic: LocalizedNarrative
}

/** Reference/calculation validation result; this is not semantic claim verification. */
export interface NarrativeVerificationResult {
  claimId: string
  submittedStatement: string
  evidenceValidationStatus: VerificationStatus
  claimSupportStatus: ClaimSupportStatus
  reason: string
  evidence: EvidenceReference[]
  limitations: string[]
  validationMethod: 'match_event_evidence_catalog_v1'
  validationScope: 'evidence_reference_membership_and_registered_calculation_consistency'
}

/**
 * GET /api/v1/matches/{matchId}/events/{eventId}/decision-analysis/narrative
 *
 * Scores and ranking remain in the nested backend analysis; the client does
 * not calculate or amend them.
 */
export interface DecisionNarrativeResponse {
  matchId: string
  eventId: string
  provenance: DataProvenance
  analysis: DecisionAnalysis
  verificationResults: NarrativeVerificationResult[]
  narrative: NarratorOutput
}
