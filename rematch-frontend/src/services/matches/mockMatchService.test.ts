import { describe, expect, it } from 'vitest'
import { SYNTHETIC_MATCHES, SYNTHETIC_SCENARIO_ID } from '../../mocks'
import {
  filterSyntheticMatches,
  MatchNotFoundError,
  mockMatchService,
} from './index'

describe('filterSyntheticMatches', () => {
  it('filters by home team name', () => {
    const result = filterSyntheticMatches(SYNTHETIC_MATCHES, {
      query: 'northgate',
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('m-northgate-riverside-2401')
  })

  it('filters by away team name', () => {
    const result = filterSyntheticMatches(SYNTHETIC_MATCHES, {
      query: 'silvermere',
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.awayTeam.name).toBe('Silvermere FC')
  })

  it('filters by competition', () => {
    const result = filterSyntheticMatches(SYNTHETIC_MATCHES, {
      query: 'coastal',
    })
    expect(result).toHaveLength(2)
    expect(result.every((m) => m.competition === 'Coastal League')).toBe(true)
  })

  it('filters each match status', () => {
    expect(
      filterSyntheticMatches(SYNTHETIC_MATCHES, { status: 'live' }),
    ).toHaveLength(3)
    expect(
      filterSyntheticMatches(SYNTHETIC_MATCHES, { status: 'finished' }),
    ).toHaveLength(2)
    expect(
      filterSyntheticMatches(SYNTHETIC_MATCHES, { status: 'upcoming' }),
    ).toHaveLength(1)
    expect(
      filterSyntheticMatches(SYNTHETIC_MATCHES, { status: 'all' }),
    ).toHaveLength(SYNTHETIC_MATCHES.length)
  })

  it('returns empty results for unmatched query', () => {
    expect(
      filterSyntheticMatches(SYNTHETIC_MATCHES, {
        query: 'premier league official',
      }),
    ).toHaveLength(0)
  })
})

describe('mockMatchService', () => {
  it('exposes synthetic provenance and scenario id', async () => {
    const info = await mockMatchService.getDatasetInfo()
    expect(info.provenance).toBe('synthetic')
    expect(info.scenarioId).toBe(SYNTHETIC_SCENARIO_ID)

    const matches = await mockMatchService.getMatches()
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.every((m) => m.provenance === 'synthetic')).toBe(true)
    expect(matches.every((m) => m.scenarioId === SYNTHETIC_SCENARIO_ID)).toBe(
      true,
    )
  })

  it('returns null for a missing match id', async () => {
    await expect(mockMatchService.getMatchById('does-not-exist')).resolves.toBe(
      null,
    )
  })

  it('throws MatchNotFoundError for events on a missing match', async () => {
    await expect(
      mockMatchService.getMatchEvents('does-not-exist'),
    ).rejects.toBeInstanceOf(MatchNotFoundError)
  })

  it('returns events for matches that have them and [] otherwise', async () => {
    const withEvents = await mockMatchService.getMatchEvents(
      'm-northgate-riverside-2401',
    )
    expect(withEvents.length).toBeGreaterThan(0)
    expect(withEvents.every((e) => e.provenance === 'synthetic')).toBe(true)

    const withoutEvents = await mockMatchService.getMatchEvents(
      'm-lakeside-ironford-2405',
    )
    expect(withoutEvents).toEqual([])
  })

  it('returns no frames for the current synthetic scenario', async () => {
    const frames = await mockMatchService.getMatchFrames(
      'm-northgate-riverside-2401',
    )
    expect(frames).toEqual([])
  })

  it('does not fabricate match intelligence aggregates from static fixtures', async () => {
    await expect(
      mockMatchService.getMatchIntelligence('m-northgate-riverside-2401'),
    ).resolves.toBeNull()
    await expect(
      mockMatchService.getMatchIntelligence('does-not-exist'),
    ).rejects.toBeInstanceOf(MatchNotFoundError)
  })
})
