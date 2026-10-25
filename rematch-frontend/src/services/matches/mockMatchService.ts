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
import type {
  MatchContext,
  MatchSummary,
  Player,
  StartMatchResponse,
  TeamFormResult,
} from '../../types'
import {
  AskUnavailableError,
  DecisionInsufficientEvidenceError,
  DecisionNarrativeUnavailableError,
  DecisionNotFoundError,
  EventIntelligenceUnavailableError,
  MatchApiError,
  MatchNotFoundError,
  type MatchListFilters,
  type MatchService,
} from './types'

const MOCK_FORM: TeamFormResult[] = [
  {
    id: 'mock-form-1',
    teamId: 'team-placeholder',
    playedAt: '2026-09-20T15:00:00.000Z',
    opponentName: 'Ashford Town',
    isHome: true,
    goalsFor: 2,
    goalsAgainst: 1,
    result: 'W',
    competition: 'Metro Premier Cup',
    provenance: 'synthetic',
  },
  {
    id: 'mock-form-2',
    teamId: 'team-placeholder',
    playedAt: '2026-09-13T15:00:00.000Z',
    opponentName: 'Bramley United',
    isHome: false,
    goalsFor: 1,
    goalsAgainst: 1,
    result: 'D',
    competition: 'Metro Premier Cup',
    provenance: 'synthetic',
  },
  {
    id: 'mock-form-3',
    teamId: 'team-placeholder',
    playedAt: '2026-09-06T15:00:00.000Z',
    opponentName: 'Cedar Hill',
    isHome: true,
    goalsFor: 0,
    goalsAgainst: 2,
    result: 'L',
    competition: 'Coastal League',
    provenance: 'synthetic',
  },
  {
    id: 'mock-form-4',
    teamId: 'team-placeholder',
    playedAt: '2026-08-30T15:00:00.000Z',
    opponentName: 'Dunmere Athletic',
    isHome: false,
    goalsFor: 3,
    goalsAgainst: 0,
    result: 'W',
    competition: 'Northern Circuit',
    provenance: 'synthetic',
  },
  {
    id: 'mock-form-5',
    teamId: 'team-placeholder',
    playedAt: '2026-08-23T15:00:00.000Z',
    opponentName: 'Elmwood Rovers',
    isHome: true,
    goalsFor: 1,
    goalsAgainst: 0,
    result: 'W',
    competition: 'Metro Premier Cup',
    provenance: 'synthetic',
  },
]

function formForTeam(teamId: string): TeamFormResult[] {
  return MOCK_FORM.map((row, index) => ({
    ...row,
    id: `form-${teamId}-${index + 1}`,
    teamId,
  }))
}

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

  async getSystemMetrics() {
    // Static fixtures cannot truthfully represent process telemetry.
    return null
  },

  async getMatchIntelligence(matchId) {
    requireMatch(matchId)
    // The static catalogue has no backend-derived aggregate payload. Returning
    // null makes the limitation explicit instead of reconstructing insights.
    return null
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

  async getEventIntelligence(matchId, eventId) {
    throw new EventIntelligenceUnavailableError(
      'Event intelligence is unavailable in mock mode. Use API mode with the seeded backend; no briefing is fabricated from static fixtures.',
      matchId,
      eventId,
    )
  },

  async askMatch(matchId) {
    requireMatch(matchId)
    throw new AskUnavailableError(
      'Ask the crew is unavailable in mock mode. Use API mode with the seeded backend; no free-form answers are fabricated from static fixtures.',
      matchId,
    )
  },

  async getMatchContext(matchId) {
    const match = requireMatch(matchId)
    const players = getSyntheticPlayersForMatch(matchId)
    return {
      match,
      homeCoachName: match.homeTeam.coachName ?? null,
      awayCoachName: match.awayTeam.coachName ?? null,
      homeForm: formForTeam(match.homeTeam.id),
      awayForm: formForTeam(match.awayTeam.id),
      playerStats: [],
      homePlayers: players.filter((p) => p.teamId === match.homeTeam.id),
      awayPlayers: players.filter((p) => p.teamId === match.awayTeam.id),
    } satisfies MatchContext
  },

  async getTeamForm(teamId) {
    return formForTeam(teamId)
  },

  async startMatch(matchId) {
    const match = requireMatch(matchId)
    if (match.status !== 'upcoming' || !match.canStart) {
      throw new MatchApiError(
        `Match ${matchId} cannot be started (status=${match.status})`,
        409,
        'match_not_startable',
      )
    }
    match.status = 'live'
    match.minute = 0
    match.score = { home: 0, away: 0 }
    match.canStart = false
    match.liveRealDurationSeconds = 180
    return { match, started: true } satisfies StartMatchResponse
  },
}
