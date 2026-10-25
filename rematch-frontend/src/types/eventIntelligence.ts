import type { DataProvenance } from './provenance'
import type { DecisionAnalysis, LocalizedNarrative } from './decision'

/** Backend EvidenceTier — distinguishes facts, metrics, hypotheses, and gaps. */
export type EvidenceTier = 'fact' | 'metric' | 'hypothesis' | 'missing'

export interface EvidenceStatement {
  tier: EvidenceTier
  english: string
  arabic: string
}

/**
 * GET /api/v1/matches/{matchId}/events/{eventId}/event-intelligence
 *
 * Evidence-grounded bilingual briefing. Never invents players, outcomes, or
 * causal links. llmConnected is true only when the backend successfully used a
 * configured server-side provider; otherwise the deterministic fallback is shown.
 */
export interface EventIntelligence {
  matchId: string
  eventId: string
  eventType: string
  provenance: DataProvenance
  analysisMethod: string
  llmConnected: boolean
  decisionCandidate: boolean
  english: LocalizedNarrative
  arabic: LocalizedNarrative
  statements: EvidenceStatement[]
  missingEvidence: string[]
  limitations: string[]
  decisionAnalysis: DecisionAnalysis | null
}
