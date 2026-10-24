import { describe, expect, it } from 'vitest'
import type { MatchEvent, Player, Team } from '../types'
import {
  buildPassNetwork,
  buildPlayerTable,
  buildShotRace,
  buildTeamComparison,
} from './matchCentre'

const home: Team = {
  id: 'home',
  name: 'Home FC',
  shortName: 'HOM',
}
const away: Team = {
  id: 'away',
  name: 'Away FC',
  shortName: 'AWY',
}

const players: Player[] = [
  { id: 'p1', name: 'One', teamId: 'home', shirtNumber: 8 },
  { id: 'p2', name: 'Two', teamId: 'home', shirtNumber: 10 },
  { id: 'p3', name: 'Three', teamId: 'away', shirtNumber: 9 },
]

const events: MatchEvent[] = [
  {
    id: 'e1',
    matchId: 'm1',
    type: 'pass',
    minute: 10,
    teamId: 'home',
    playerId: 'p1',
    receiverId: 'p2',
    start: { x: 40, y: 50 },
    end: { x: 55, y: 55 },
    outcome: 'complete',
    provenance: 'synthetic',
  },
  {
    id: 'e2',
    matchId: 'm1',
    type: 'shot',
    minute: 20,
    teamId: 'home',
    playerId: 'p2',
    location: { x: 85, y: 50 },
    outcome: 'goal',
    provenance: 'synthetic',
  },
  {
    id: 'e3',
    matchId: 'm1',
    type: 'shot',
    minute: 40,
    teamId: 'away',
    playerId: 'p3',
    location: { x: 15, y: 48 },
    outcome: 'saved',
    provenance: 'synthetic',
  },
]

describe('matchCentre aggregates', () => {
  it('builds team comparison from event types', () => {
    const rows = buildTeamComparison(events, home.id, away.id)
    const passes = rows.find((r) => r.key === 'passes')
    const shots = rows.find((r) => r.key === 'shots')
    expect(passes).toEqual({ key: 'passes', home: 1, away: 0 })
    expect(shots).toEqual({ key: 'shots', home: 1, away: 1 })
  })

  it('builds a cumulative shot race', () => {
    const race = buildShotRace(events, home.id, away.id)
    expect(race[0]).toEqual({ minute: 0, home: 0, away: 0 })
    expect(race.at(-1)).toEqual({ minute: 40, home: 1, away: 1 })
  })

  it('ranks players by involvement', () => {
    const table = buildPlayerTable(events, players)
    expect(table.map((row) => row.playerId).sort()).toEqual(['p1', 'p2', 'p3'])
    expect(table.find((r) => r.playerId === 'p1')?.passes).toBe(1)
    expect(table.find((r) => r.playerId === 'p2')?.shots).toBe(1)
  })

  it('builds a pass network from completed passes', () => {
    const network = buildPassNetwork(events, players, [], home)
    expect(network.nodes).toHaveLength(2)
    expect(network.edges).toEqual([
      { fromId: 'p1', toId: 'p2', count: 1 },
    ])
  })
})
