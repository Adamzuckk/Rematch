import { describe, expect, it } from 'vitest'
import type { MatchEvent, MatchFrame } from '../../types'
import { resolveFrameForEvent } from './resolveFrame'

describe('resolveFrameForEvent', () => {
  const event: MatchEvent = {
    id: 'evt-1',
    matchId: 'm1',
    type: 'shot',
    location: { x: 50, y: 50 },
    provenance: 'synthetic',
  }

  it('returns undefined when frames are missing', () => {
    expect(resolveFrameForEvent([], event)).toBeUndefined()
    expect(resolveFrameForEvent([], null)).toBeUndefined()
  })

  it('matches by eventId without inventing a frame', () => {
    const frames: MatchFrame[] = [
      {
        id: 'f-other',
        matchId: 'm1',
        eventId: 'evt-other',
        players: [],
        provenance: 'synthetic',
      },
      {
        id: 'f-1',
        matchId: 'm1',
        eventId: 'evt-1',
        players: [
          {
            playerId: 'p1',
            teamId: 't1',
            position: { x: 10, y: 10 },
          },
        ],
        provenance: 'synthetic',
      },
    ]

    expect(resolveFrameForEvent(frames, event)?.id).toBe('f-1')
  })
})
