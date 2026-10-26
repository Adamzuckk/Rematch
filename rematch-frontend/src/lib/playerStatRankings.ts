import type {
  MatchEvent,
  MatchSummary,
  Player,
  PlayerMatchStats,
  Team,
} from '../types'

export type PlayerStatMetric =
  | 'goals'
  | 'assists'
  | 'goalsAssists'
  | 'xg'
  | 'cleanSheets'
  | 'yellowCards'
  | 'redCards'
  | 'fouls'
  | 'penaltiesSaved'
  | 'appearances'
  | 'minutesPlayed'
  | 'ownGoals'

/**
 * Metrics that cannot be sourced from catalogue events / player match stats.
 * Own goals are derived from shot events with goalType === 'own_goal'.
 */
export const UNSUPPORTED_PLAYER_METRICS: ReadonlySet<PlayerStatMetric> = new Set([
  'xg',
  'penaltiesSaved',
  'minutesPlayed',
])

export type PlayerPositionFilter =
  | 'all'
  | 'goalkeeper'
  | 'defender'
  | 'midfielder'
  | 'forward'

export interface AggregatedPlayerStat {
  playerId: string
  playerName: string
  teamId: string
  teamName: string
  role: string | null
  positionGroup: PlayerPositionFilter | 'unknown'
  /** True when at least one match contributed event-derived stats. */
  hasEventStats: boolean
  /** True when the player is a GK (or already recorded a clean sheet). */
  hasCleanSheetSample: boolean
  appearances: number
  cleanSheets: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  fouls: number
  ownGoals: number
}

export interface PlayerRankingRow {
  rank: number
  player: AggregatedPlayerStat
  value: number
}

/** One match's inputs for aggregation — events preferred over empty context stats. */
export interface MatchPlayerStatSource {
  match: MatchSummary
  players: readonly Player[]
  events: readonly MatchEvent[]
  /** Optional precomputed rows (e.g. API match context); used when non-empty. */
  playerStats?: readonly PlayerMatchStats[] | null
}

interface MutableAggregate {
  playerId: string
  playerName: string
  teamId: string
  teamName: string
  role: string | null
  matchIds: Set<string>
  cleanSheetMatchIds: Set<string>
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  fouls: number
  ownGoals: number
  hasEventStats: boolean
}

function teamNameFromMatch(match: MatchSummary, teamId: string): string {
  if (match.homeTeam.id === teamId) return match.homeTeam.name
  if (match.awayTeam.id === teamId) return match.awayTeam.name
  return teamId
}

/**
 * Normalize catalogue role strings into coarse position groups.
 * Unknown / missing roles map to `unknown` and only match "All Positions".
 */
export function normalizePlayerPosition(
  role: string | null | undefined,
): PlayerPositionFilter | 'unknown' {
  if (!role) return 'unknown'
  const normalized = role.trim().toUpperCase()
  if (!normalized) return 'unknown'

  if (
    normalized === 'GK' ||
    normalized === 'G' ||
    normalized === 'GOALKEEPER' ||
    normalized.includes('KEEP')
  ) {
    return 'goalkeeper'
  }

  if (
    normalized === 'DF' ||
    normalized === 'D' ||
    normalized === 'DEFENDER' ||
    normalized === 'CB' ||
    normalized === 'LB' ||
    normalized === 'RB' ||
    normalized === 'LWB' ||
    normalized === 'RWB' ||
    normalized.includes('DEF') ||
    normalized.includes('BACK')
  ) {
    return 'defender'
  }

  if (
    normalized === 'MF' ||
    normalized === 'M' ||
    normalized === 'MIDFIELDER' ||
    normalized === 'CM' ||
    normalized === 'CDM' ||
    normalized === 'CAM' ||
    normalized === 'LM' ||
    normalized === 'RM' ||
    normalized.includes('MID') ||
    normalized.includes('WING')
  ) {
    return 'midfielder'
  }

  if (
    normalized === 'FW' ||
    normalized === 'F' ||
    normalized === 'FORWARD' ||
    normalized === 'ST' ||
    normalized === 'CF' ||
    normalized === 'LW' ||
    normalized === 'RW' ||
    normalized.includes('STRIK') ||
    normalized.includes('ATT') ||
    normalized.includes('FORWARD')
  ) {
    return 'forward'
  }

  return 'unknown'
}

/**
 * Mirror backend compute_player_stats: derive per-match rows from recorded events.
 * Players unknown to the match player list are skipped (no invented identities).
 */
export function computePlayerStatsFromEvents(
  events: readonly MatchEvent[],
  players: readonly Player[],
): PlayerMatchStats[] {
  const byId = new Map(players.map((player) => [player.id, player]))
  const stats = new Map<string, PlayerMatchStats>()

  const ensure = (playerId: string): PlayerMatchStats | null => {
    const player = byId.get(playerId)
    if (!player) return null
    const existing = stats.get(playerId)
    if (existing) return existing
    const created: PlayerMatchStats = {
      playerId: player.id,
      playerName: player.name,
      teamId: player.teamId,
      shirtNumber: player.shirtNumber ?? null,
      role: player.role ?? null,
      goals: 0,
      assists: 0,
      shots: 0,
      passes: 0,
      tackles: 0,
      fouls: 0,
      yellowCards: 0,
      redCards: 0,
      offsides: 0,
    }
    stats.set(playerId, created)
    return created
  }

  for (const event of events) {
    if (event.playerId) {
      const row = ensure(event.playerId)
      if (row) {
        if (event.type === 'shot') {
          row.shots += 1
          if (event.outcome === 'goal' && event.goalType !== 'own_goal') {
            row.goals += 1
          }
        } else if (event.type === 'pass') {
          row.passes += 1
        } else if (event.type === 'tackle') {
          row.tackles += 1
        } else if (event.type === 'foul') {
          row.fouls += 1
        } else if (event.type === 'yellow_card') {
          row.yellowCards += 1
        } else if (event.type === 'red_card') {
          row.redCards += 1
        } else if (event.type === 'offside') {
          row.offsides += 1
        }
      }
    }

    if (
      event.type === 'shot' &&
      event.assistPlayerId &&
      event.outcome === 'goal'
    ) {
      const assistRow = ensure(event.assistPlayerId)
      if (assistRow) assistRow.assists += 1
    }
  }

  return Array.from(stats.values()).sort(
    (a, b) => b.goals + b.assists - (a.goals + a.assists) ||
      a.playerName.localeCompare(b.playerName),
  )
}

function countOwnGoals(
  events: readonly MatchEvent[],
  playerId: string,
): number {
  let total = 0
  for (const event of events) {
    if (
      event.type === 'shot' &&
      event.playerId === playerId &&
      event.outcome === 'goal' &&
      event.goalType === 'own_goal'
    ) {
      total += 1
    }
  }
  return total
}

function ensurePlayer(
  store: Map<string, MutableAggregate>,
  playerId: string,
  playerName: string,
  teamId: string,
  teamName: string,
  role: string | null | undefined,
): MutableAggregate {
  const existing = store.get(playerId)
  if (existing) {
    if (!existing.role && role) existing.role = role
    if (playerName) existing.playerName = playerName
    return existing
  }
  const created: MutableAggregate = {
    playerId,
    playerName,
    teamId,
    teamName,
    role: role ?? null,
    matchIds: new Set(),
    cleanSheetMatchIds: new Set(),
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    fouls: 0,
    ownGoals: 0,
    hasEventStats: false,
  }
  store.set(playerId, created)
  return created
}

function applyMatchStats(
  store: Map<string, MutableAggregate>,
  stats: PlayerMatchStats,
  matchId: string,
  teamName: string,
  ownGoals: number,
): void {
  const row = ensurePlayer(
    store,
    stats.playerId,
    stats.playerName,
    stats.teamId,
    teamName,
    stats.role,
  )
  row.matchIds.add(matchId)
  row.hasEventStats = true
  row.goals += stats.goals
  row.assists += stats.assists
  row.yellowCards += stats.yellowCards
  row.redCards += stats.redCards
  row.fouls += stats.fouls
  row.ownGoals += ownGoals
}

/**
 * Aggregate player statistics from match events (and optional context stats).
 * Appearances count only matches with event-derived participation — not roster membership.
 * Clean sheets: finished matches, GA = 0, player is GK and participated via events.
 */
export function aggregatePlayerStatsFromSources(
  sources: readonly MatchPlayerStatSource[],
): AggregatedPlayerStat[] {
  const store = new Map<string, MutableAggregate>()

  for (const source of sources) {
    const { match, events, players } = source
    const precomputed =
      source.playerStats && source.playerStats.length > 0
        ? source.playerStats
        : null
    const perMatchStats =
      precomputed ?? computePlayerStatsFromEvents(events, players)

    if (perMatchStats.length === 0) continue

    const playersById = new Map(players.map((player) => [player.id, player]))

    for (const stats of perMatchStats) {
      applyMatchStats(
        store,
        stats,
        match.id,
        teamNameFromMatch(match, stats.teamId),
        countOwnGoals(events, stats.playerId),
      )
    }

    const finishedWithScore =
      match.status === 'finished' &&
      match.score != null &&
      Number.isFinite(match.score.home) &&
      Number.isFinite(match.score.away)

    if (!finishedWithScore || !match.score) continue

    const homeClean = match.score.away === 0
    const awayClean = match.score.home === 0

    for (const stats of perMatchStats) {
      const player = playersById.get(stats.playerId)
      const role = stats.role ?? player?.role ?? null
      if (normalizePlayerPosition(role) !== 'goalkeeper') continue
      const keptClean =
        stats.teamId === match.homeTeam.id
          ? homeClean
          : stats.teamId === match.awayTeam.id
            ? awayClean
            : false
      if (!keptClean) continue
      const row = store.get(stats.playerId)
      if (row) row.cleanSheetMatchIds.add(match.id)
    }
  }

  return Array.from(store.values()).map((row) => ({
    playerId: row.playerId,
    playerName: row.playerName,
    teamId: row.teamId,
    teamName: row.teamName,
    role: row.role,
    positionGroup: normalizePlayerPosition(row.role),
    hasEventStats: row.hasEventStats,
    hasCleanSheetSample:
      row.cleanSheetMatchIds.size > 0 ||
      normalizePlayerPosition(row.role) === 'goalkeeper',
    appearances: row.matchIds.size,
    cleanSheets: row.cleanSheetMatchIds.size,
    goals: row.goals,
    assists: row.assists,
    yellowCards: row.yellowCards,
    redCards: row.redCards,
    fouls: row.fouls,
    ownGoals: row.ownGoals,
  }))
}

/** @deprecated Prefer aggregatePlayerStatsFromSources with event payloads. */
export function aggregatePlayerStats(
  contexts: readonly {
    match: MatchSummary
    homePlayers: readonly Player[]
    awayPlayers: readonly Player[]
    playerStats: readonly PlayerMatchStats[]
  }[],
): AggregatedPlayerStat[] {
  return aggregatePlayerStatsFromSources(
    contexts.map((ctx) => ({
      match: ctx.match,
      players: [...ctx.homePlayers, ...ctx.awayPlayers],
      events: [],
      playerStats: ctx.playerStats,
    })),
  )
}

const EVENT_METRICS: ReadonlySet<PlayerStatMetric> = new Set([
  'goals',
  'assists',
  'goalsAssists',
  'yellowCards',
  'redCards',
  'fouls',
  'ownGoals',
])

export function metricValueForPlayer(
  player: AggregatedPlayerStat,
  metric: PlayerStatMetric,
): number | null {
  if (UNSUPPORTED_PLAYER_METRICS.has(metric)) return null

  if (EVENT_METRICS.has(metric) && !player.hasEventStats) {
    return null
  }

  switch (metric) {
    case 'goals':
      return player.goals
    case 'assists':
      return player.assists
    case 'goalsAssists':
      return player.goals + player.assists
    case 'cleanSheets':
      return player.hasCleanSheetSample || player.cleanSheets > 0
        ? player.cleanSheets
        : null
    case 'yellowCards':
      return player.yellowCards
    case 'redCards':
      return player.redCards
    case 'fouls':
      return player.fouls
    case 'appearances':
      return player.appearances > 0 ? player.appearances : null
    case 'ownGoals':
      return player.ownGoals
    default:
      return null
  }
}

export function isMetricSupported(metric: PlayerStatMetric): boolean {
  return !UNSUPPORTED_PLAYER_METRICS.has(metric)
}

/**
 * Rank players for a metric. Unsupported metrics yield an empty list —
 * callers should show an unavailable state instead.
 */
export function rankPlayersByMetric(
  players: readonly AggregatedPlayerStat[],
  metric: PlayerStatMetric,
  filters?: {
    teamId?: string | null
    position?: PlayerPositionFilter
  },
): PlayerRankingRow[] {
  if (!isMetricSupported(metric)) return []

  const teamId = filters?.teamId?.trim() || null
  const position = filters?.position ?? 'all'

  const filtered = players.filter((player) => {
    if (teamId && player.teamId !== teamId) return false
    if (position !== 'all' && player.positionGroup !== position) return false
    return true
  })

  const scored = filtered
    .map((player) => {
      const value = metricValueForPlayer(player, metric)
      return value == null ? null : { player, value }
    })
    .filter((row): row is { player: AggregatedPlayerStat; value: number } => row != null)
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value
      return a.player.playerName.localeCompare(b.player.playerName)
    })

  return scored.map((row, index) => {
    const previous = index > 0 ? scored[index - 1] : undefined
    const rank =
      previous && previous.value === row.value
        ? scored.findIndex((candidate) => candidate.value === row.value) + 1
        : index + 1
    return { rank, player: row.player, value: row.value }
  })
}

/** Unique clubs from an authoritative team list (standings catalogue). */
export function clubsFromTeams(teams: readonly Team[]): Team[] {
  return teams.slice().sort((a, b) => a.name.localeCompare(b.name))
}

/** Unique clubs from aggregated players, sorted by name. */
export function clubsFromPlayers(
  players: readonly AggregatedPlayerStat[],
): Team[] {
  const map = new Map<string, Team>()
  for (const player of players) {
    if (!map.has(player.teamId)) {
      map.set(player.teamId, { id: player.teamId, name: player.teamName })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}
