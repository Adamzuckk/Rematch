import { describe, expect, it } from 'vitest'
import type { MatchEvent } from '../../types'
import { getEventGeometry, isDecisionCandidate } from './eventGeometry'

describe('getEventGeometry', () => {
  it('extracts pass path when both ends exist', () => {
    const event: MatchEvent = {
      id: 'p1',
      matchId: 'm1',
      type: 'pass',
      start: { x: 10, y: 20 },
      end: { x: 40, y: 50 },
      provenance: 'synthetic',
    }
    expect(getEventGeometry(event)).toEqual({
      path: { start: { x: 10, y: 20 }, end: { x: 40, y: 50 } },
      location: { x: 40, y: 50 },
    })
  })

  it('does not invent geometry for possession changes', () => {
    const event: MatchEvent = {
      id: 'pc1',
      matchId: 'm1',
      type: 'possession_change',
      provenance: 'synthetic',
    }
    expect(getEventGeometry(event)).toEqual({})
  })

  it('uses single available endpoint when the other is missing', () => {
    const event: MatchEvent = {
      id: 'c1',
      matchId: 'm1',
      type: 'carry',
      start: { x: 15, y: 25 },
      provenance: 'synthetic',
    }
    expect(getEventGeometry(event)).toEqual({ location: { x: 15, y: 25 } })
  })
})

describe('isDecisionCandidate', () => {
  it('flags pass, shot, and carry only', () => {
    expect(
      isDecisionCandidate({
        id: '1',
        matchId: 'm',
        type: 'pass',
        provenance: 'synthetic',
      }),
    ).toBe(true)
    expect(
      isDecisionCandidate({
        id: '2',
        matchId: 'm',
        type: 'pressure',
        provenance: 'synthetic',
      }),
    ).toBe(false)
  })
})
