import { describe, expect, it } from 'vitest'
import type {
  MatchEvent,
  MatchSummary,
  Player,
  PlayerMatchStats,
} from '../types'
import {
  aggregatePlayerStatsFromSources,
  clubsFromTeams,
  computePlayerStatsFromEvents,
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

describe('normalizePlayerPosition', () => {
  it('maps common role labels', () => {
    expect(normalizePlayerPosition('GK')).toBe('goalkeeper')
    expect(normalizePlayerPosition('cb')).toBe('defender')
    expect(normalizePlayerPosition('CAM')).toBe('midfielder')
    expect(normalizePlayerPosition('ST')).toBe('forward')
    expect(normalizePlayerPosition(undefined)).toBe('unknown')
  })
})

describe('computePlayerStatsFromEvents', () => {
  it('counts goals, assists, fouls, and cards from recorded events', () => {
    const fw = player('p-fw', 'Striker', home.id, 'FW')
    const mf = player('p-mf', 'Creator', home.id, 'MF')
    const events: MatchEvent[] = [
      {
        id: 'e1',
        matchId: 'm1',
        type: 'shot',
        playerId: fw.id,
        teamId: home.id,
        outcome: 'goal',
        assistPlayerId: mf.id,
        provenance: 'synthetic',
      },
      {
        id: 'e2',
        matchId: 'm1',
        type: 'foul',
        playerId: mf.id,
        teamId: home.id,
        provenance: 'synthetic',
      },
      {
        id: 'e3',
        matchId: 'm1',
        type: 'yellow_card',
        playerId: mf.id,
        teamId: home.id,
        provenance: 'synthetic',
      },
      {
        id: 'e4',
        matchId: 'm1',
        type: 'shot',
        playerId: fw.id,
        teamId: home.id,
        outcome: 'goal',
        goalType: 'own_goal',
        provenance: 'synthetic',
      },
    ]

    const rows = computePlayerStatsFromEvents(events, [fw, mf])
    const striker = rows.find((row) => row.playerId === fw.id)
    const creator = rows.find((row) => row.playerId === mf.id)
    expect(striker?.goals).toBe(1)
    expect(creator?.assists).toBe(1)
    expect(creator?.fouls).toBe(1)
    expect(creator?.yellowCards).toBe(1)
  })
})

describe('aggregatePlayerStatsFromSources + rankPlayersByMetric', () => {
  const gkHome = player('p-gk', 'Keeper One', home.id, 'GK')
  const fwHome = player('p-fw', 'Striker One', home.id, 'FW')
  const mfAway = player('p-mf', 'Mid Two', away.id, 'MF')

  const sources = [
    {
      match: finishedMatch('m1', { home: 2, away: 0 }),
      players: [gkHome, fwHome, mfAway],
      events: [] as MatchEvent[],
      playerStats: [
        {
          playerId: fwHome.id,
          playerName: fwHome.name,
          teamId: home.id,
          role: 'FW',
          goals: 2,
          assists: 0,
          shots: 2,
          passes: 0,
          tackles: 0,
          fouls: 0,
          yellowCards: 0,
          redCards: 0,
          offsides: 0,
        },
        {
          playerId: mfAway.id,
          playerName: mfAway.name,
          teamId: away.id,
          role: 'MF',
          goals: 0,
          assists: 1,
          shots: 0,
          passes: 4,
          tackles: 0,
          fouls: 2,
          yellowCards: 1,
          redCards: 0,
          offsides: 0,
        },
        {
          playerId: gkHome.id,
          playerName: gkHome.name,
          teamId: home.id,
          role: 'GK',
          goals: 0,
          assists: 0,
          shots: 0,
          passes: 1,
          tackles: 0,
          fouls: 0,
          yellowCards: 0,
          redCards: 0,
          offsides: 0,
        },
      ] satisfies PlayerMatchStats[],
    },
    {
      match: finishedMatch('m2', { home: 1, away: 1 }),
      players: [gkHome, fwHome, mfAway],
      events: [] as MatchEvent[],
      playerStats: [
        {
          playerId: fwHome.id,
          playerName: fwHome.name,
          teamId: home.id,
          role: 'FW',
          goals: 1,
          assists: 1,
          shots: 1,
          passes: 0,
          tackles: 0,
          fouls: 0,
          yellowCards: 0,
          redCards: 0,
          offsides: 0,
        },
        {
          playerId: mfAway.id,
          playerName: mfAway.name,
          teamId: away.id,
          role: 'MF',
          goals: 1,
          assists: 0,
          shots: 1,
          passes: 0,
          tackles: 0,
          fouls: 0,
          yellowCards: 0,
          redCards: 0,
          offsides: 0,
        },
      ] satisfies PlayerMatchStats[],
    },
  ]

  it('aggregates goals and applies club/position filters with name tie-break', () => {
    const players = aggregatePlayerStatsFromSources(sources)
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
    expect(homeOnly.map((row) => row.player.playerId)).toContain(fwHome.id)
    expect(homeOnly[0].player.playerId).toBe(fwHome.id)
    expect(homeOnly.every((row) => row.player.teamId === home.id)).toBe(true)

    const forwards = rankPlayersByMetric(players, 'goals', {
      position: 'forward',
    })
    expect(forwards).toHaveLength(1)
    expect(forwards[0].player.playerId).toBe(fwHome.id)

    const clubs = clubsFromTeams([home, away])
    expect(clubs.map((club) => club.id).sort()).toEqual([away.id, home.id])
  })

  it('attributes clean sheets to participating goalkeepers when GA is zero', () => {
    const players = aggregatePlayerStatsFromSources(sources)
    const ranking = rankPlayersByMetric(players, 'cleanSheets')
    expect(ranking).toHaveLength(1)
    expect(ranking[0]).toMatchObject({
      player: { playerId: gkHome.id },
      value: 1,
    })
  })

  it('derives stats from events when playerStats are empty', () => {
    const eventSources = [
      {
        match: finishedMatch('m3', { home: 1, away: 0 }),
        players: [fwHome, mfAway],
        events: [
          {
            id: 'shot-1',
            matchId: 'm3',
            type: 'shot' as const,
            playerId: fwHome.id,
            teamId: home.id,
            outcome: 'goal' as const,
            provenance: 'synthetic' as const,
          },
        ],
        playerStats: [],
      },
    ]
    const players = aggregatePlayerStatsFromSources(eventSources)
    expect(rankPlayersByMetric(players, 'goals')[0]?.value).toBe(1)
    expect(rankPlayersByMetric(players, 'appearances').length).toBeGreaterThan(0)
  })

  it('marks unsupported metrics and leaves them empty', () => {
    expect(isMetricSupported('xg')).toBe(false)
    expect(isMetricSupported('goals')).toBe(true)
    expect(isMetricSupported('ownGoals')).toBe(true)
    const players = aggregatePlayerStatsFromSources(sources)
    expect(rankPlayersByMetric(players, 'xg')).toEqual([])
    expect(rankPlayersByMetric(players, 'minutesPlayed')).toEqual([])
  })

  it('resets filter combinations: club + position together', () => {
    const players = aggregatePlayerStatsFromSources(sources)
    const rows = rankPlayersByMetric(players, 'goalsAssists', {
      teamId: away.id,
      position: 'midfielder',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBe(2)
  })
})
