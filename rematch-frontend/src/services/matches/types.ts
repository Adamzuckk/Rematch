import type {
  AskRequest,
  AskResponse,
  DashboardOverviewStat,
  DecisionAnalysis,
  DecisionNarrativeResponse,
  EventIntelligence,
  MatchContext,
  MatchDatasetInfo,
  MatchEvent,
  MatchFrame,
  MatchIntelligence,
  MatchStatusFilter,
  MatchSummary,
  Player,
  MetricsOperation,
  MetricsRange,
  StartMatchResponse,
  SystemMetrics,
  TeamFormResult,
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

  /**
   * Persisted backend telemetry. `null` means this source has no operational
   * telemetry (for example the static synthetic mock catalogue).
   */
  getSystemMetrics(
    filters?: { range?: MetricsRange; operation?: MetricsOperation },
  ): Promise<SystemMetrics | null>

  /**
   * Backend-derived event/frame aggregates for one match. `null` means the
   * active source intentionally does not provide intelligence data; callers
   * must not manufacture equivalent values from static fixtures.
   */
  getMatchIntelligence(matchId: string): Promise<MatchIntelligence | null>

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

  /**
   * Evidence-grounded bilingual briefing for any match event type.
   * Unavailable in static mock mode — never fabricate briefing content.
   */
  getEventIntelligence(
    matchId: string,
    eventId: string,
  ): Promise<EventIntelligence>

  /**
   * Grounded Ask-the-Crew question for a match (optional selected event).
   * Unavailable in static mock mode — never fabricate crew answers.
   */
  askMatch(matchId: string, request: AskRequest): Promise<AskResponse>

  /**
   * Coaches, 5-match form, squads, and player stats. Returns null when the
   * active source does not provide enrichment (static mock catalogue).
   */
  getMatchContext(matchId: string): Promise<MatchContext | null>

  /** Recent form rows for one team. Empty when unknown / unavailable. */
  getTeamForm(teamId: string): Promise<TeamFormResult[]>

  /**
   * Start an upcoming fixture on request. Throws MatchApiError 409 when the
   * match is not startable. Mock mode mutates the in-memory catalogue.
   */
  startMatch(matchId: string): Promise<StartMatchResponse>
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

/** The current data source cannot supply event intelligence. */
export class EventIntelligenceUnavailableError extends Error {
  readonly matchId: string
  readonly eventId: string

  constructor(message: string, matchId: string, eventId: string) {
    super(message)
    this.name = 'EventIntelligenceUnavailableError'
    this.matchId = matchId
    this.eventId = eventId
  }
}

/** The current data source cannot supply Ask-the-Crew answers. */
export class AskUnavailableError extends Error {
  readonly matchId: string

  constructor(message: string, matchId: string) {
    super(message)
    this.name = 'AskUnavailableError'
    this.matchId = matchId
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
