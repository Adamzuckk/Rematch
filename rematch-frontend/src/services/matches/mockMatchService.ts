import {
  SYNTHETIC_DATASET_INFO,
  SYNTHETIC_MATCHES,
  SYNTHETIC_OVERVIEW_STATS,
  SYNTHETIC_PLAYER_LIST,
  getSyntheticEventsForMatch,
  getSyntheticFramesForMatch,
} from '../../mocks'
import type { MatchSummary, Player } from '../../types'
import {
  MatchNotFoundError,
  type MatchListFilters,
  type MatchService,
} from './types'

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function requireMatch(matchId: string) {
  const match = SYNTHETIC_MATCHES.find((item) => item.id === matchId)
  if (!match) {
    throw new MatchNotFoundError(matchId)
  }
  return match
}

function collectPlayerIds(matchId: string): Set<string> {
  const ids = new Set<string>()
  for (const event of getSyntheticEventsForMatch(matchId)) {
    if (event.playerId) ids.add(event.playerId)
    if (event.type === 'pass' && event.receiverId) ids.add(event.receiverId)
  }
  return ids
}

export function filterSyntheticMatches(
  matches: readonly MatchSummary[],
  filters: MatchListFilters = {},
): MatchSummary[] {
  const status = filters.status ?? 'all'
  const query = normalize(filters.query ?? '')

  return matches.filter((match) => {
    const statusOk = status === 'all' ? true : match.status === status
    if (!statusOk) return false
    if (!query) return true
    return (
      normalize(match.homeTeam.name).includes(query) ||
      normalize(match.awayTeam.name).includes(query) ||
      normalize(match.competition).includes(query) ||
      (match.homeTeam.shortName
        ? normalize(match.homeTeam.shortName).includes(query)
        : false) ||
      (match.awayTeam.shortName
        ? normalize(match.awayTeam.shortName).includes(query)
        : false)
    )
  })
}

export function getSyntheticPlayersForMatch(matchId: string): Player[] {
  const ids = collectPlayerIds(matchId)
  return SYNTHETIC_PLAYER_LIST.filter((player) => ids.has(player.id))
}

export const mockMatchService: MatchService = {
  async getDatasetInfo() {
    return SYNTHETIC_DATASET_INFO
  },

  async getOverviewStats() {
    return SYNTHETIC_OVERVIEW_STATS
  },

  async getMatches(filters) {
    return filterSyntheticMatches(SYNTHETIC_MATCHES, filters)
  },

  async getMatchById(matchId) {
    return SYNTHETIC_MATCHES.find((match) => match.id === matchId) ?? null
  },

  async getMatchEvents(matchId) {
    requireMatch(matchId)
    return getSyntheticEventsForMatch(matchId)
  },

  async getMatchPlayers(matchId) {
    requireMatch(matchId)
    return getSyntheticPlayersForMatch(matchId)
  },

  async getMatchFrames(matchId) {
    requireMatch(matchId)
    return getSyntheticFramesForMatch(matchId)
  },
}
