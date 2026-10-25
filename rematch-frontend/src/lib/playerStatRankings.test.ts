import { describe, expect, it } from 'vitest'
import type { MatchContext, MatchSummary, Player, PlayerMatchStats } from '../types'
import {
  aggregatePlayerStats,
  clubsFromPlayers,
  isMetricSupported,
  normalizePlayerPosition,
  rankPlayersByMetric,
} from './playerStatRankings'

const home = { id: 'team-home', name: 'Home FC' }
const away = { id: 'team-away', name: 'Away United' }

function finishedMatch(id: string, score: { home: number; away: number }): MatchSummary {
  return {
    id,
    competition: 'Test League',
    homeTeam: home,
    awayTeam: away,
    status: 'finished',
    kickoffAt: '2026-10-01T15:00:00.000Z',
    score,
    provenance: 'synthetic',
    scenarioId: 'test',
  }
}

function player(
  id: string,
  name: string,
  teamId: string,
  role?: string,
): Player {
  return { id, name, teamId, role }
}

function stats(
  partial: Partial<PlayerMatchStats> &
    Pick<PlayerMatchStats, 'playerId' | 'playerName' | 'teamId'>,
): PlayerMatchStats {
  return {
    goals: 0,
    assists: 0,
    shots: 0,
    passes: 0,
    tackles: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    offsides: 0,
    ...partial,
  }
}

function context(
  match: MatchSummary,
  homePlayers: Player[],
  awayPlayers: Player[],
  playerStats: PlayerMatchStats[],
): MatchContext {
  return {
    match,
    homeForm: [],
    awayForm: [],
    homePlayers,
    awayPlayers,
    playerStats,
  }
}

describe('normalizePlayerPosition', () => {
  it('maps common role labels', () => {
    expect(normalizePlayerPosition('GK')).toBe('goalkeeper')
    expect(normalizePlayerPosition('cb')).toBe('defender')
    expect(normalizePlayerPosition('CAM')).toBe('midfielder')
    expect(normalizePlayerPosition('ST')).toBe('forward')
    expect(normalizePlayerPosition(undefined)).toBe('unknown')
  })
})

describe('aggregatePlayerStats + rankPlayersByMetric', () => {
  const gkHome = player('p-gk', 'Keeper One', home.id, 'GK')
  const fwHome = player('p-fw', 'Striker One', home.id, 'FW')
  const mfAway = player('p-mf', 'Mid Two', away.id, 'MF')

  const contexts = [
    context(
      finishedMatch('m1', { home: 2, away: 0 }),
      [gkHome, fwHome],
      [mfAway],
      [
        stats({
          playerId: fwHome.id,
          playerName: fwHome.name,
          teamId: home.id,
          role: 'FW',
          goals: 2,
          assists: 0,
        }),
        stats({
          playerId: mfAway.id,
          playerName: mfAway.name,
          teamId: away.id,
          role: 'MF',
          goals: 0,
          assists: 1,
          fouls: 2,
          yellowCards: 1,
        }),
      ],
    ),
    context(
      finishedMatch('m2', { home: 1, away: 1 }),
      [gkHome, fwHome],
      [mfAway],
      [
        stats({
          playerId: fwHome.id,
          playerName: fwHome.name,
          teamId: home.id,
          role: 'FW',
          goals: 1,
          assists: 1,
        }),
        stats({
          playerId: mfAway.id,
          playerName: mfAway.name,
          teamId: away.id,
          role: 'MF',
          goals: 1,
          assists: 0,
        }),
      ],
    ),
  ]

  it('aggregates goals and applies club/position filters with name tie-break', () => {
    const players = aggregatePlayerStats(contexts)
    const ranking = rankPlayersByMetric(players, 'goals')
    expect(ranking[0]).toMatchObject({
      rank: 1,
      value: 3,
      player: { playerId: fwHome.id },
    })
    expect(ranking[1]).toMatchObject({
      value: 1,
      player: { playerId: mfAway.id },
    })

    const homeOnly = rankPlayersByMetric(players, 'goals', { teamId: home.id })
    expect(homeOnly).toHaveLength(1)
    expect(homeOnly[0].player.playerId).toBe(fwHome.id)

    const forwards = rankPlayersByMetric(players, 'goals', {
      position: 'forward',
    })
    expect(forwards).toHaveLength(1)
    expect(forwards[0].player.playerId).toBe(fwHome.id)

    const clubs = clubsFromPlayers(players)
    expect(clubs.map((club) => club.id).sort()).toEqual([away.id, home.id])
  })

  it('attributes clean sheets to goalkeepers when the team concedes zero', () => {
    const players = aggregatePlayerStats(contexts)
    const ranking = rankPlayersByMetric(players, 'cleanSheets')
    expect(ranking).toHaveLength(1)
    expect(ranking[0]).toMatchObject({
      player: { playerId: gkHome.id },
      value: 1,
    })
  })

  it('does not invent event stats when playerStats are empty', () => {
    const empty = [
      context(finishedMatch('m3', { home: 1, away: 0 }), [fwHome], [mfAway], []),
    ]
    const players = aggregatePlayerStats(empty)
    expect(rankPlayersByMetric(players, 'goals')).toHaveLength(0)
    expect(rankPlayersByMetric(players, 'appearances').length).toBeGreaterThan(0)
  })

  it('marks unsupported metrics and leaves them empty', () => {
    expect(isMetricSupported('xg')).toBe(false)
    expect(isMetricSupported('goals')).toBe(true)
    const players = aggregatePlayerStats(contexts)
    expect(rankPlayersByMetric(players, 'xg')).toEqual([])
    expect(rankPlayersByMetric(players, 'minutesPlayed')).toEqual([])
  })

  it('resets filter combinations: club + position together', () => {
    const players = aggregatePlayerStats(contexts)
    const rows = rankPlayersByMetric(players, 'goalsAssists', {
      teamId: away.id,
      position: 'midfielder',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBe(2)
  })
})
