import type { DataProvenance } from './provenance'
import type { Team } from './team'

export type MatchStatus = 'live' | 'finished' | 'upcoming'

export type MatchStatusFilter = 'all' | MatchStatus

export interface MatchScore {
  home: number
  away: number
}

/**
 * Match list/detail summary for the Dashboard and navigation labels.
 * Possession, xG, and other stats are intentionally absent until a dataset
 * or API supplies them.
 */
export interface MatchSummary {
  id: string
  competition: string
  homeTeam: Team
  awayTeam: Team
  status: MatchStatus
  /** ISO-8601 kickoff / scheduled time */
  kickoffAt: string
  /** Present for live and finished matches when the dataset includes a score */
  score?: MatchScore
  /** Match minute for live fixtures when supplied */
  minute?: number
  venue?: string
  provenance: DataProvenance
  /** Scenario / seed identifier that produced this fixture */
  scenarioId: string
}

export interface DashboardOverviewStat {
  id: string
  label: string
  value: string
  hint: string
  /** Explicitly marks the value as non-measured demo content */
  isDemoValue: true
}

export interface MatchDatasetInfo {
  scenarioId: string
  provenance: DataProvenance
  description: string
  matchCount: number
  limitations: string[]
}
