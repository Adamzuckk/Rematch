import type {
  DashboardOverviewStat,
  DecisionAnalysis,
  DecisionNarrativeResponse,
  MatchDatasetInfo,
  MatchEvent,
  MatchFrame,
  MatchStatusFilter,
  MatchSummary,
  Player,
} from '../../types'

export interface MatchListFilters {
  /** Free-text search over home/away team names and competition */
  query?: string
  status?: MatchStatusFilter
}

export interface MatchService {
  /** Catalogue metadata for the active data source */
  getDatasetInfo(): Promise<MatchDatasetInfo>

  /** Demo overview chips when the source supplies them; otherwise empty */
  getOverviewStats(): Promise<DashboardOverviewStat[]>

  getMatches(filters?: MatchListFilters): Promise<MatchSummary[]>

  /** Returns null when the match ID is unknown */
  getMatchById(matchId: string): Promise<MatchSummary | null>

  /**
   * Events for a known match. Returns [] when the match exists but has no
   * events in the dataset. Throws when the match ID is unknown.
   */
  getMatchEvents(matchId: string): Promise<MatchEvent[]>

  /**
   * Players referenced by the match dataset (e.g. event participants).
   * Returns [] when none are known. Throws when the match ID is unknown.
   */
  getMatchPlayers(matchId: string): Promise<Player[]>

  /**
   * Pitch frames for a known match. Returns [] when the dataset has none
   * (current synthetic scenario ships no frames). Throws when unknown.
   */
  getMatchFrames(matchId: string): Promise<MatchFrame[]>

  /**
   * Decision analysis for a match event.
   * Backend is the source of truth for scores and ranking.
   * Throws DecisionNotFoundError (404), DecisionInsufficientEvidenceError (422),
   * or MatchApiError (network / other HTTP failures).
   */
  getDecisionAnalysis(
    matchId: string,
    eventId: string,
  ): Promise<DecisionAnalysis>

  /**
   * Composed deterministic bilingual narrative for an existing decision.
   * This is unavailable in the static mock catalogue because it must never
   * fabricate narrative content outside the backend response.
   */
  getDecisionNarrative(
    matchId: string,
    eventId: string,
  ): Promise<DecisionNarrativeResponse>
}

export class MatchNotFoundError extends Error {
  readonly matchId: string

  constructor(matchId: string) {
    super(`Match not found: ${matchId}`)
    this.name = 'MatchNotFoundError'
    this.matchId = matchId
  }
}

export class MatchServiceConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MatchServiceConfigError'
  }
}

export class MatchApiError extends Error {
  readonly status?: number
  readonly code?: string

  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.name = 'MatchApiError'
    this.status = status
    this.code = code
  }
}

/** 404 match_not_found or event_not_found from decision-analysis. */
export class DecisionNotFoundError extends Error {
  readonly status = 404 as const
  readonly code: 'match_not_found' | 'event_not_found'
  readonly matchId: string
  readonly eventId?: string

  constructor(
    code: 'match_not_found' | 'event_not_found',
    message: string,
    matchId: string,
    eventId?: string,
  ) {
    super(message)
    this.name = 'DecisionNotFoundError'
    this.code = code
    this.matchId = matchId
    this.eventId = eventId
  }
}

/** 422 insufficient_evidence — event exists but cannot be analysed. */
export class DecisionInsufficientEvidenceError extends Error {
  readonly status = 422 as const
  readonly code = 'insufficient_evidence' as const
  readonly matchId: string
  readonly eventId: string

  constructor(message: string, matchId: string, eventId: string) {
    super(message)
    this.name = 'DecisionInsufficientEvidenceError'
    this.matchId = matchId
    this.eventId = eventId
  }
}

/** The current data source cannot supply a backend-composed narrative. */
export class DecisionNarrativeUnavailableError extends Error {
  readonly matchId: string
  readonly eventId: string

  constructor(message: string, matchId: string, eventId: string) {
    super(message)
    this.name = 'DecisionNarrativeUnavailableError'
    this.matchId = matchId
    this.eventId = eventId
  }
}

/** Shared API error envelope from the backend. */
export interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
}
