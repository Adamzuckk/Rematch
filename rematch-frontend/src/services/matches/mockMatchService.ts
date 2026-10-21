import {
  DECISION_CANDIDATE_TYPES,
  SYNTHETIC_DATASET_INFO,
  SYNTHETIC_DECISION_ANALYSES,
  SYNTHETIC_MATCHES,
  SYNTHETIC_OVERVIEW_STATS,
  SYNTHETIC_PLAYER_LIST,
  decisionFixtureKey,
  getSyntheticEventsForMatch,
  getSyntheticFramesForMatch,
} from '../../mocks'
import type { MatchSummary, Player } from '../../types'
import {
  DecisionInsufficientEvidenceError,
  DecisionNarrativeUnavailableError,
  DecisionNotFoundError,
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

  async getDecisionAnalysis(matchId, eventId) {
    const match = SYNTHETIC_MATCHES.find((item) => item.id === matchId)
    if (!match) {
      throw new DecisionNotFoundError(
        'match_not_found',
        `Match not found: ${matchId}`,
        matchId,
        eventId,
      )
    }

    const events = getSyntheticEventsForMatch(matchId)
    const event = events.find((item) => item.id === eventId)
    if (!event) {
      throw new DecisionNotFoundError(
        'event_not_found',
        `Event not found: ${eventId} in match ${matchId}`,
        matchId,
        eventId,
      )
    }

    if (!DECISION_CANDIDATE_TYPES.has(event.type)) {
      throw new DecisionInsufficientEvidenceError(
        `Event type '${event.type}' is not a decision candidate. Supported types: ['carry', 'pass', 'shot']`,
        matchId,
        eventId,
      )
    }

    const fixture =
      SYNTHETIC_DECISION_ANALYSES[decisionFixtureKey(matchId, eventId)]
    if (!fixture) {
      // Candidate type but no authored fixture (e.g. shot without offline scores)
      throw new DecisionInsufficientEvidenceError(
        'No synthetic decision fixture for this event in mock mode. Use API mode against the seeded backend for live analysis.',
        matchId,
        eventId,
      )
    }

    return fixture
  },

  async getDecisionNarrative(matchId, eventId) {
    throw new DecisionNarrativeUnavailableError(
      'Narrative is unavailable in mock mode. Use API mode with the seeded backend; no narrative is fabricated from static fixtures.',
      matchId,
      eventId,
    )
  },
}
