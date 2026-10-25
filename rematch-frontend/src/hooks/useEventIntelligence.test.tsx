import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EventIntelligenceUnavailableError,
  matchService,
} from '../services/matches'
import type { EventIntelligence } from '../types'
import { useEventIntelligence } from './useEventIntelligence'

const sample: EventIntelligence = {
  matchId: 'm-1',
  eventId: 'evt-1',
  eventType: 'pass',
  provenance: 'synthetic',
  analysisMethod: 'deterministic_event_intelligence_v1',
  llmConnected: false,
  decisionCandidate: true,
  english: {
    headline: 'Pass',
    keyObservations: ['A pass was recorded.'],
    limitations: [],
    whatHappened: ['A pass was recorded.'],
    whyItMattered: [],
    whatCouldHaveHappened: [],
  },
  arabic: {
    headline: 'تمريرة',
    keyObservations: ['سُجّلت تمريرة.'],
    limitations: [],
    whatHappened: ['سُجّلت تمريرة.'],
    whyItMattered: [],
    whatCouldHaveHappened: [],
  },
  statements: [],
  missingEvidence: [],
  limitations: [],
  decisionAnalysis: null,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useEventIntelligence', () => {
  it('loads ready intelligence for the selected event', async () => {
    vi.spyOn(matchService, 'getEventIntelligence').mockResolvedValue(sample)

    const { result } = renderHook(() => useEventIntelligence('m-1', 'evt-1'))

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready')
    })
    expect(result.current.state).toMatchObject({
      status: 'ready',
      matchId: 'm-1',
      eventId: 'evt-1',
      intelligence: sample,
    })
    expect(matchService.getEventIntelligence).toHaveBeenCalledWith('m-1', 'evt-1')
  })

  it('surfaces mock unavailability without fabricating a briefing', async () => {
    vi.spyOn(matchService, 'getEventIntelligence').mockRejectedValue(
      new EventIntelligenceUnavailableError('unavailable in mock mode'),
    )

    const { result } = renderHook(() => useEventIntelligence('m-1', 'evt-1'))

    await waitFor(() => {
      expect(result.current.state.status).toBe('unavailable')
    })
    expect(result.current.state).toMatchObject({
      status: 'unavailable',
      message: 'unavailable in mock mode',
    })
  })

  it('retries after a transient error', async () => {
    const spy = vi
      .spyOn(matchService, 'getEventIntelligence')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(sample)

    const { result } = renderHook(() => useEventIntelligence('m-1', 'evt-1'))

    await waitFor(() => {
      expect(result.current.state.status).toBe('error')
    })

    await act(async () => {
      result.current.retry()
    })

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready')
    })
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
