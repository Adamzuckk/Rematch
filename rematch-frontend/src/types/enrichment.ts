import type { MatchSummary } from './match'
import type { Player } from './player'
import type { DataProvenance } from './provenance'
import type { Team } from './team'

export interface TeamFormResult {
  id: string
  teamId: string
  playedAt: string
  opponentName: string
  isHome: boolean
  goalsFor: number
  goalsAgainst: number
  result: 'W' | 'D' | 'L'
  competition: string
  provenance: DataProvenance
}

export interface PlayerMatchStats {
  playerId: string
  playerName: string
  teamId: string
  shirtNumber?: number | null
  role?: string | null
  goals: number
  assists: number
  shots: number
  passes: number
  tackles: number
  fouls: number
  yellowCards: number
  redCards: number
  offsides: number
}

export interface MatchContext {
  match: MatchSummary
  homeCoachName?: string | null
  awayCoachName?: string | null
  homeForm: TeamFormResult[]
  awayForm: TeamFormResult[]
  playerStats: PlayerMatchStats[]
  homePlayers: Player[]
  awayPlayers: Player[]
}

export interface StartMatchResponse {
  match: MatchSummary
  started: true
}

export interface TeamDetail {
  team: Team
  form: TeamFormResult[]
}
