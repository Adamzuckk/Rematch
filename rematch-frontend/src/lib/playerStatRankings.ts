import type { MatchContext, PlayerMatchStats, Team } from '../types'

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

/** Metrics that cannot be sourced or reliably derived from current catalogue data. */
export const UNSUPPORTED_PLAYER_METRICS: ReadonlySet<PlayerStatMetric> = new Set([
  'xg',
  'penaltiesSaved',
  'minutesPlayed',
  'ownGoals',
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
  /** True when at least one match contributed event-derived PlayerMatchStats. */
  hasEventStats: boolean
  /** True when at least one clean-sheet opportunity was attributable (GK + GA 0). */
  hasCleanSheetSample: boolean
  appearances: number
  cleanSheets: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  fouls: number
}

export interface PlayerRankingRow {
  rank: number
  player: AggregatedPlayerStat
  value: number
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
  hasEventStats: boolean
}

function teamNameLookup(contexts: readonly MatchContext[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const ctx of contexts) {
    map.set(ctx.match.homeTeam.id, ctx.match.homeTeam.name)
    map.set(ctx.match.awayTeam.id, ctx.match.awayTeam.name)
  }
  return map
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
    hasEventStats: false,
  }
  store.set(playerId, created)
  return created
}

function applyMatchStats(
  store: Map<string, MutableAggregate>,
  stats: PlayerMatchStats,
  matchId: string,
  teamNames: Map<string, string>,
): void {
  const row = ensurePlayer(
    store,
    stats.playerId,
    stats.playerName,
    stats.teamId,
    teamNames.get(stats.teamId) ?? stats.teamId,
    stats.role,
  )
  row.matchIds.add(matchId)
  row.hasEventStats = true
  row.goals += stats.goals
  row.assists += stats.assists
  row.yellowCards += stats.yellowCards
  row.redCards += stats.redCards
  row.fouls += stats.fouls
}

/**
 * Aggregate player statistics across match contexts.
 * Clean sheets are attributed only to players with a goalkeeper role who
 * appeared in a finished match where their team conceded zero goals.
 */
export function aggregatePlayerStats(
  contexts: readonly MatchContext[],
): AggregatedPlayerStat[] {
  const teamNames = teamNameLookup(contexts)
  const store = new Map<string, MutableAggregate>()

  for (const ctx of contexts) {
    if (ctx.match.status !== 'finished' || !ctx.match.score) continue

    const matchId = ctx.match.id
    const homeClean = ctx.match.score.away === 0
    const awayClean = ctx.match.score.home === 0

    for (const player of [...ctx.homePlayers, ...ctx.awayPlayers]) {
      ensurePlayer(
        store,
        player.id,
        player.name,
        player.teamId,
        teamNames.get(player.teamId) ?? player.teamId,
        player.role,
      ).matchIds.add(matchId)
    }

    for (const stats of ctx.playerStats) {
      applyMatchStats(store, stats, matchId, teamNames)
    }

    const considerCleanSheet = (
      players: typeof ctx.homePlayers,
      teamKeptClean: boolean,
    ) => {
      if (!teamKeptClean) return
      for (const player of players) {
        if (normalizePlayerPosition(player.role) !== 'goalkeeper') continue
        const row = ensurePlayer(
          store,
          player.id,
          player.name,
          player.teamId,
          teamNames.get(player.teamId) ?? player.teamId,
          player.role,
        )
        row.cleanSheetMatchIds.add(matchId)
      }
    }

    considerCleanSheet(ctx.homePlayers, homeClean)
    considerCleanSheet(ctx.awayPlayers, awayClean)
  }

  return Array.from(store.values()).map((row) => ({
    playerId: row.playerId,
    playerName: row.playerName,
    teamId: row.teamId,
    teamName: row.teamName,
    role: row.role,
    positionGroup: normalizePlayerPosition(row.role),
    hasEventStats: row.hasEventStats,
    hasCleanSheetSample: row.cleanSheetMatchIds.size > 0 ||
      normalizePlayerPosition(row.role) === 'goalkeeper',
    appearances: row.matchIds.size,
    cleanSheets: row.cleanSheetMatchIds.size,
    goals: row.goals,
    assists: row.assists,
    yellowCards: row.yellowCards,
    redCards: row.redCards,
    fouls: row.fouls,
  }))
}

const EVENT_METRICS: ReadonlySet<PlayerStatMetric> = new Set([
  'goals',
  'assists',
  'goalsAssists',
  'yellowCards',
  'redCards',
  'fouls',
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

  // Dense rank by value; ties share the same rank display via first occurrence index + 1
  // after stable name sort — use competition ranking (1,2,2,4) via sorted position.
  return scored.map((row, index) => {
    const previous = index > 0 ? scored[index - 1] : undefined
    const rank =
      previous && previous.value === row.value
        ? scored.findIndex((candidate) => candidate.value === row.value) + 1
        : index + 1
    return { rank, player: row.player, value: row.value }
  })
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
