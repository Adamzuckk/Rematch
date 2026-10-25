import type { DataProvenance } from './provenance'
import type { LocalizedNarrative, NarrativeVerificationResult } from './decision'

export type AskStatus = 'answered' | 'partial' | 'unsupported' | 'unavailable'
export type AskIntent =
  | 'greeting'
  | 'help'
  | 'narrative'
  | 'verification'
  | 'local_facts'
  | 'whatif'
  | 'unsupported'
export type AskFactClass =
  | 'match_data'
  | 'calculated'
  | 'alternative_estimate'
  | 'unknown'
  | 'capability'
export type AskLanguage = 'en' | 'ar'

export interface AskRequest {
  question: string
  eventId?: string | null
  language?: AskLanguage
  clientRequestId?: string | null
}

export interface AskAnswerBody {
  english: LocalizedNarrative
  arabic: LocalizedNarrative
}

export interface AskEvidenceRef {
  kind: 'event' | 'frame' | 'calculation' | 'player_position' | 'match'
  id: string
  matchId: string
  detail?: string | null
}

/**
 * POST /api/v1/matches/{matchId}/ask
 * Grounded Ask-the-Crew response — not unrestricted AI chat.
 */
export interface AskResponse {
  matchId: string
  eventId: string | null
  status: AskStatus
  intent: AskIntent
  provenance: DataProvenance
  answer: AskAnswerBody
  evidence: AskEvidenceRef[]
  relatedEventIds: string[]
  factClasses: AskFactClass[]
  reason: string | null
  verificationResults: NarrativeVerificationResult[]
  clientRequestId: string | null
}
