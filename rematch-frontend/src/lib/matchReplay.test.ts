import { describe, expect, it } from 'vitest'
import type { MatchEvent } from '../types'
import {
  HALFTIME_MINUTE,
  buildScoreRace,
  eventMinuteProgress,
  filterEventsForMode,
  isHighlightEvent,
  matchClockMaxMinute,
  scoreRaceStepPath,
} from './matchReplay'

const events: MatchEvent[] = [
  {
    id: 'pass-1',
    matchId: 'm1',
    type: 'pass',
    minute: 12,
    teamId: 'home',
    playerId: 'p1',
    provenance: 'synthetic',
  },
  {
    id: 'goal-1',
    matchId: 'm1',
    type: 'shot',
    minute: 23,
    teamId: 'home',
    playerId: 'p2',
    outcome: 'goal',
    provenance: 'synthetic',
  },
  {
    id: 'pressure-1',
    matchId: 'm1',
    type: 'pressure',
    minute: 30,
    teamId: 'away',
    provenance: 'synthetic',
  },
  {
    id: 'shot-2',
    matchId: 'm1',
    type: 'shot',
    minute: 55,
    teamId: 'away',
    playerId: 'p3',
    outcome: 'saved',
    provenance: 'synthetic',
  },
  {
    id: 'goal-2',
    matchId: 'm1',
    type: 'shot',
    minute: 70,
    teamId: 'away',
    playerId: 'p3',
    outcome: 'goal',
    provenance: 'synthetic',
  },
]

describe('matchReplay helpers', () => {
  it('builds a cumulative score race only from goals', () => {
    const race = buildScoreRace(events, 'home', 'away')
    expect(race.points[0]).toEqual({ minute: 0, home: 0, away: 0 })
    expect(race.points.at(-1)).toMatchObject({
      minute: 70,
      home: 1,
      away: 1,
      eventId: 'goal-2',
    })
    expect(race.derivedScore).toEqual({ home: 1, away: 1 })
    expect(race.markers.some((m) => m.eventId === 'goal-1' && m.kind === 'goal')).toBe(
      true,
    )
    expect(race.markers.some((m) => m.eventId === 'shot-2' && m.kind === 'shot')).toBe(
      true,
    )
    expect(race.markers.some((m) => m.eventId === 'pass-1' && m.kind === 'decision')).toBe(
      true,
    )
    expect(race.markers.some((m) => m.eventId === 'pressure-1')).toBe(false)
  })

  it('does not invent goals when none exist', () => {
    const race = buildScoreRace(
      events.filter((e) => e.type !== 'shot' || e.outcome !== 'goal'),
      'home',
      'away',
    )
    expect(race.derivedScore).toEqual({ home: 0, away: 0 })
    expect(race.points).toEqual([{ minute: 0, home: 0, away: 0 }])
  })

  it('filters highlights to goals, shots, and decision candidates', () => {
    expect(isHighlightEvent(events[2]!)).toBe(false)
    const highlights = filterEventsForMode(events, 'highlights')
    expect(highlights.map((e) => e.id)).toEqual([
      'pass-1',
      'goal-1',
      'shot-2',
      'goal-2',
    ])
    expect(filterEventsForMode(events, 'full')).toHaveLength(events.length)
  })

  it('computes clock max and playhead progress with HT baseline', () => {
    expect(matchClockMaxMinute(events)).toBe(90)
    expect(HALFTIME_MINUTE).toBe(45)
    expect(eventMinuteProgress(events[1]!, 90)).toBeCloseTo(23 / 90)
    expect(eventMinuteProgress(null, 90)).toBe(0)
  })

  it('builds a step path that holds then rises', () => {
    const race = buildScoreRace(events, 'home', 'away')
    const path = scoreRaceStepPath(race.points, 'home', 90, 2, 600, 160)
    expect(path.split(' ').length).toBeGreaterThan(3)
    expect(path).toContain('0.0,')
  })
})
