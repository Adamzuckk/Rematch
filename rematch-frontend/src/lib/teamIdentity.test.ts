import { describe, expect, it } from 'vitest'
import { teamHue, teamMonogram } from './teamIdentity'

describe('teamIdentity', () => {
  it('prefers shortName for monograms', () => {
    expect(
      teamMonogram({ id: 't1', name: 'Northgate FC', shortName: 'NGFC' }),
    ).toBe('NGFC')
  })

  it('falls back to initials from the team name', () => {
    expect(teamMonogram({ id: 't2', name: 'Harbor Athletic' })).toBe('HA')
  })

  it('returns a stable hue for the same team id', () => {
    expect(teamHue('team-northgate')).toBe(teamHue('team-northgate'))
    expect(teamHue('team-northgate')).not.toBe(teamHue('team-riverside'))
  })
})
