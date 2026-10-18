import { describe, expect, it } from 'vitest'
import type { MatchEvent } from '../../types'
import { formatEventMinute, sortMatchEvents } from './sortEvents'

const base = {
  matchId: 'm-test',
  provenance: 'synthetic' as const,
}

describe('sortMatchEvents', () => {
  it('orders by minute, then occurredAt, then id', () => {
    const events: MatchEvent[] = [
      {
        ...base,
        id: 'b',
        type: 'pressure',
        minute: 20,
        occurredAt: '2026-01-01T00:20:00.000Z',
        location: { x: 10, y: 10 },
      },
      {
        ...base,
        id: 'a',
        type: 'pass',
        minute: 10,
        occurredAt: '2026-01-01T00:10:00.000Z',
        start: { x: 1, y: 1 },
        end: { x: 2, y: 2 },
      },
      {
        ...base,
        id: 'c-later',
        type: 'shot',
        minute: 20,
        occurredAt: '2026-01-01T00:20:30.000Z',
        location: { x: 30, y: 30 },
      },
      {
        ...base,
        id: 'c-earlier',
        type: 'tackle',
        minute: 20,
        occurredAt: '2026-01-01T00:20:00.000Z',
        location: { x: 20, y: 20 },
      },
    ]

    expect(sortMatchEvents(events).map((e) => e.id)).toEqual([
      'a',
      'b',
      'c-earlier',
      'c-later',
    ])
  })

  it('places events without minute after timed events', () => {
    const events: MatchEvent[] = [
      {
        ...base,
        id: 'untimed',
        type: 'possession_change',
      },
      {
        ...base,
        id: 'timed',
        type: 'shot',
        minute: 5,
        location: { x: 50, y: 50 },
      },
    ]

    expect(sortMatchEvents(events).map((e) => e.id)).toEqual([
      'timed',
      'untimed',
    ])
  })
})

describe('formatEventMinute', () => {
  it('formats known minutes and marks missing ones', () => {
    expect(formatEventMinute(12)).toBe("12'")
    expect(formatEventMinute(undefined)).toBe('—')
    expect(formatEventMinute(Number.NaN)).toBe('—')
  })
})
