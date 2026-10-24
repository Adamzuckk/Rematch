import type {
  MatchEvent,
  MatchFrame,
  MatchEventType,
  PassEvent,
  Player,
  Team,
} from '../types'
import type { PitchPoint } from '../types/coordinates'
import { isValidPitchPoint } from '../types/coordinates'

export type MatchCentreStatKey =
  | 'passes'
  | 'shots'
  | 'carries'
  | 'tackles'
  | 'pressures'
  | 'events'

export interface MatchCentreComparisonRow {
  key: MatchCentreStatKey
  home: number
  away: number
}

export interface MatchCentreRacePoint {
  minute: number
  home: number
  away: number
}

export interface MatchCentrePlayerRow {
  playerId: string
  name: string
  teamId: string
  shirtNumber: number | null
  passes: number
  shots: number
  carries: number
  tackles: number
  pressures: number
  total: number
}

export interface PassNetworkNode {
  playerId: string
  shirtNumber: number | null
  name: string
  position: PitchPoint
  touches: number
}

export interface PassNetworkEdge {
  fromId: string
  toId: string
  count: number
}

export interface PassNetwork {
  teamId: string
  teamName: string
  nodes: PassNetworkNode[]
  edges: PassNetworkEdge[]
}

const STAT_TYPES: { key: MatchCentreStatKey; type: MatchEventType | 'events' }[] =
  [
    { key: 'passes', type: 'pass' },
    { key: 'shots', type: 'shot' },
    { key: 'carries', type: 'carry' },
    { key: 'tackles', type: 'tackle' },
    { key: 'pressures', type: 'pressure' },
    { key: 'events', type: 'events' },
  ]

function countForTeam(
  events: MatchEvent[],
  teamId: string,
  type: MatchEventType | 'events',
): number {
  return events.filter((event) => {
    if (event.teamId !== teamId) return false
    if (type === 'events') return true
    return event.type === type
  }).length
}

/** Horizontal comparison bars from seeded event counts (not xG / possession). */
export function buildTeamComparison(
  events: MatchEvent[],
  homeTeamId: string,
  awayTeamId: string,
): MatchCentreComparisonRow[] {
  return STAT_TYPES.map(({ key, type }) => ({
    key,
    home: countForTeam(events, homeTeamId, type),
    away: countForTeam(events, awayTeamId, type),
  }))
}

/**
 * Cumulative shot count by match minute for each team.
 * Labeled as a shot race in the UI — never presented as xG.
 */
export function buildShotRace(
  events: MatchEvent[],
  homeTeamId: string,
  awayTeamId: string,
): MatchCentreRacePoint[] {
  const shots = events
    .filter((event) => event.type === 'shot' && event.minute != null)
    .slice()
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))

  if (shots.length === 0) return []

  const points: MatchCentreRacePoint[] = [{ minute: 0, home: 0, away: 0 }]
  let home = 0
  let away = 0

  for (const shot of shots) {
    const minute = shot.minute ?? 0
    if (shot.teamId === homeTeamId) home += 1
    else if (shot.teamId === awayTeamId) away += 1
    points.push({ minute, home, away })
  }

  return points
}

export function buildPlayerTable(
  events: MatchEvent[],
  players: Player[],
): MatchCentrePlayerRow[] {
  const byId = new Map<string, MatchCentrePlayerRow>()

  for (const player of players) {
    byId.set(player.id, {
      playerId: player.id,
      name: player.name,
      teamId: player.teamId,
      shirtNumber: player.shirtNumber ?? null,
      passes: 0,
      shots: 0,
      carries: 0,
      tackles: 0,
      pressures: 0,
      total: 0,
    })
  }

  for (const event of events) {
    if (!event.playerId) continue
    let row = byId.get(event.playerId)
    if (!row) {
      row = {
        playerId: event.playerId,
        name: event.playerId,
        teamId: event.teamId ?? '',
        shirtNumber: null,
        passes: 0,
        shots: 0,
        carries: 0,
        tackles: 0,
        pressures: 0,
        total: 0,
      }
      byId.set(event.playerId, row)
    }
    switch (event.type) {
      case 'pass':
        row.passes += 1
        break
      case 'shot':
        row.shots += 1
        break
      case 'carry':
        row.carries += 1
        break
      case 'tackle':
        row.tackles += 1
        break
      case 'pressure':
        row.pressures += 1
        break
      default:
        break
    }
    row.total =
      row.passes + row.shots + row.carries + row.tackles + row.pressures
  }

  return [...byId.values()]
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

function averagePosition(
  playerId: string,
  frames: MatchFrame[],
): PitchPoint | null {
  let sumX = 0
  let sumY = 0
  let count = 0
  for (const frame of frames) {
    const found = frame.players.find((p) => p.playerId === playerId)
    if (!found || !isValidPitchPoint(found.position)) continue
    sumX += found.position.x
    sumY += found.position.y
    count += 1
  }
  if (count === 0) return null
  return { x: sumX / count, y: sumY / count }
}

function fallbackPassPosition(
  playerId: string,
  events: MatchEvent[],
  asReceiver: boolean,
): PitchPoint | null {
  const points: PitchPoint[] = []
  for (const event of events) {
    if (event.type !== 'pass') continue
    if (!asReceiver && event.playerId === playerId && event.start) {
      if (isValidPitchPoint(event.start)) points.push(event.start)
    }
    if (asReceiver && event.receiverId === playerId && event.end) {
      if (isValidPitchPoint(event.end)) points.push(event.end)
    }
  }
  if (points.length === 0) return null
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  }
}

/** Pass network from completed passes + average frame / pass endpoints. */
export function buildPassNetwork(
  events: MatchEvent[],
  players: Player[],
  frames: MatchFrame[],
  team: Team,
): PassNetwork {
  const teamPasses = events.filter(
    (event): event is PassEvent =>
      event.type === 'pass' &&
      event.teamId === team.id &&
      event.outcome !== 'incomplete' &&
      Boolean(event.playerId) &&
      Boolean(event.receiverId),
  )

  const edgeMap = new Map<string, PassNetworkEdge>()
  const touchMap = new Map<string, number>()

  for (const pass of teamPasses) {
    const fromId = pass.playerId!
    const toId = pass.receiverId!
    touchMap.set(fromId, (touchMap.get(fromId) ?? 0) + 1)
    touchMap.set(toId, (touchMap.get(toId) ?? 0) + 1)
    const key = `${fromId}->${toId}`
    const existing = edgeMap.get(key)
    if (existing) existing.count += 1
    else edgeMap.set(key, { fromId, toId, count: 1 })
  }

  const teamPlayers = players.filter((p) => p.teamId === team.id)
  const involvedIds = new Set(touchMap.keys())
  const nodes: PassNetworkNode[] = []

  for (const player of teamPlayers) {
    if (!involvedIds.has(player.id)) continue
    const position =
      averagePosition(player.id, frames) ??
      fallbackPassPosition(player.id, teamPasses, false) ??
      fallbackPassPosition(player.id, teamPasses, true)
    if (!position) continue
    nodes.push({
      playerId: player.id,
      shirtNumber: player.shirtNumber ?? null,
      name: player.name,
      position,
      touches: touchMap.get(player.id) ?? 0,
    })
  }

  // Include receivers/passers not in the roster when they have geometry.
  for (const playerId of involvedIds) {
    if (nodes.some((n) => n.playerId === playerId)) continue
    const position =
      averagePosition(playerId, frames) ??
      fallbackPassPosition(playerId, teamPasses, false) ??
      fallbackPassPosition(playerId, teamPasses, true)
    if (!position) continue
    nodes.push({
      playerId,
      shirtNumber: null,
      name: playerId,
      position,
      touches: touchMap.get(playerId) ?? 0,
    })
  }

  const nodeIds = new Set(nodes.map((n) => n.playerId))
  const edges = [...edgeMap.values()].filter(
    (edge) => nodeIds.has(edge.fromId) && nodeIds.has(edge.toId),
  )

  return {
    teamId: team.id,
    teamName: team.name,
    nodes,
    edges,
  }
}
