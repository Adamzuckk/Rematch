import { describe, expect, it } from 'vitest'
import type { MatchSummary } from '../types'
import {
  buildStandings,
  competitionsWithCompletedMatches,
  extractCompletedResults,
} from './standings'

const team = (id: string, name: string) => ({ id, name, shortName: id })

function match(
  partial: Partial<MatchSummary> &
    Pick<MatchSummary, 'id' | 'status' | 'homeTeam' | 'awayTeam'>,
): MatchSummary {
  return {
    competition: 'Test League',
    kickoffAt: '2026-10-01T15:00:00.000Z',
    provenance: 'synthetic',
    scenarioId: 'test',
    ...partial,
  }
}

describe('extractCompletedResults', () => {
  it('counts each finished scored match once per side and skips unfinished fixtures', () => {
    const matches = [
      match({
        id: 'm1',
        status: 'finished',
        homeTeam: team('a', 'Alpha'),
        awayTeam: team('b', 'Beta'),
        score: { home: 2, away: 1 },
        kickoffAt: '2026-10-02T15:00:00.000Z',
      }),
      match({
        id: 'm2',
        status: 'upcoming',
        homeTeam: team('a', 'Alpha'),
        awayTeam: team('c', 'Gamma'),
      }),
      match({
        id: 'm3',
        status: 'live',
        homeTeam: team('b', 'Beta'),
        awayTeam: team('c', 'Gamma'),
        score: { home: 0, away: 0 },
      }),
      match({
        id: 'm4',
        status: 'finished',
        homeTeam: team('c', 'Gamma'),
        awayTeam: team('a', 'Alpha'),
        // finished without score — excluded
      }),
    ]

    const rows = extractCompletedResults(matches)
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.teamId).sort()).toEqual(['a', 'b'])
  })
})

describe('buildStandings', () => {
  it('computes points, GD, GF:GA, and form oldest-to-newest for last five', () => {
    const alpha = team('a', 'Alpha')
    const beta = team('b', 'Beta')
    const gamma = team('c', 'Gamma')

    const matches = [
      match({
        id: 'm1',
        status: 'finished',
        homeTeam: alpha,
        awayTeam: beta,
        score: { home: 1, away: 0 },
        kickoffAt: '2026-09-01T15:00:00.000Z',
      }),
      match({
        id: 'm2',
        status: 'finished',
        homeTeam: alpha,
        awayTeam: gamma,
        score: { home: 2, away: 2 },
        kickoffAt: '2026-09-08T15:00:00.000Z',
      }),
      match({
        id: 'm3',
        status: 'finished',
        homeTeam: beta,
        awayTeam: alpha,
        score: { home: 3, away: 0 },
        kickoffAt: '2026-09-15T15:00:00.000Z',
      }),
      match({
        id: 'm4',
        status: 'finished',
        homeTeam: gamma,
        awayTeam: alpha,
        score: { home: 0, away: 1 },
        kickoffAt: '2026-09-22T15:00:00.000Z',
      }),
      match({
        id: 'm5',
        status: 'finished',
        homeTeam: alpha,
        awayTeam: beta,
        score: { home: 4, away: 1 },
        kickoffAt: '2026-09-29T15:00:00.000Z',
      }),
      match({
        id: 'm6',
        status: 'finished',
        homeTeam: gamma,
        awayTeam: alpha,
        score: { home: 1, away: 1 },
        kickoffAt: '2026-10-06T15:00:00.000Z',
      }),
      match({
        id: 'upcoming',
        status: 'upcoming',
        homeTeam: alpha,
        awayTeam: beta,
      }),
    ]

    const standings = buildStandings(matches)
    const alphaRow = standings.find((row) => row.team.id === 'a')
    expect(alphaRow).toBeDefined()
    expect(alphaRow?.played).toBe(6)
    expect(alphaRow?.won).toBe(3)
    expect(alphaRow?.drawn).toBe(2)
    expect(alphaRow?.lost).toBe(1)
    expect(alphaRow?.goalsFor).toBe(9)
    expect(alphaRow?.goalsAgainst).toBe(7)
    expect(alphaRow?.goalDifference).toBe(2)
    expect(alphaRow?.points).toBe(11)
    // Last five chronological: m2 D, m3 L, m4 W, m5 W, m6 D
    expect(alphaRow?.form).toEqual(['D', 'L', 'W', 'W', 'D'])

    expect(standings[0].team.id).toBe('a')
  })

  it('applies points → GD → GF tie-breakers and scopes by competition', () => {
    const a = team('a', 'Alpha')
    const b = team('b', 'Beta')
    const matches = [
      match({
        id: 'm1',
        status: 'finished',
        competition: 'League One',
        homeTeam: a,
        awayTeam: b,
        score: { home: 1, away: 0 },
      }),
      match({
        id: 'm2',
        status: 'finished',
        competition: 'Cup',
        homeTeam: b,
        awayTeam: a,
        score: { home: 5, away: 0 },
      }),
    ]

    expect(competitionsWithCompletedMatches(matches)).toEqual(['Cup', 'League One'])

    const leagueOne = buildStandings(matches, { competition: 'League One' })
    expect(leagueOne).toHaveLength(2)
    expect(leagueOne[0].team.id).toBe('a')
    expect(leagueOne[0].points).toBe(3)
    expect(leagueOne[1].points).toBe(0)
  })
})
