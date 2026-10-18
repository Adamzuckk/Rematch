import type {
  DashboardOverviewStat,
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

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'MatchApiError'
    this.status = status
  }
}
