import { useCallback, useEffect, useRef, useState } from 'react'
import type { EventIntelligence } from '../types'
import {
  DecisionNotFoundError,
  EventIntelligenceUnavailableError,
  MatchApiError,
  matchService,
} from '../services/matches'

export type EventIntelligenceState =
  | { status: 'idle' }
  | { status: 'loading'; matchId: string; eventId: string }
  | {
      status: 'ready'
      matchId: string
      eventId: string
      intelligence: EventIntelligence
    }
  | {
      status: 'unavailable'
      matchId: string
      eventId: string
      message: string
    }
  | {
      status: 'not-found'
      matchId: string
      eventId: string
      code: 'match_not_found' | 'event_not_found'
      message: string
    }
  | {
      status: 'error'
      matchId: string
      eventId: string
      message: string
      retryable: boolean
    }

type FetchResult =
  | { kind: 'ready'; intelligence: EventIntelligence }
  | { kind: 'unavailable'; message: string }
  | {
      kind: 'not-found'
      code: 'match_not_found' | 'event_not_found'
      message: string
    }
  | { kind: 'error'; message: string; retryable: boolean }

/**
 * Loads the deterministic event briefing for the selected match event.
 * Does not fabricate content when the backend or mock source cannot supply it.
 */
export function useEventIntelligence(
  matchId: string | undefined,
  eventId: string | undefined,
  enabled = true,
) {
  const [retryToken, setRetryToken] = useState(0)
  const [fetched, setFetched] = useState<{
    matchId: string
    eventId: string
    result: FetchResult
  } | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!enabled || !matchId || !eventId) return

    const requestId = ++requestIdRef.current
    let cancelled = false

    void (async () => {
      try {
        const intelligence = await matchService.getEventIntelligence(
          matchId,
          eventId,
        )
        if (cancelled || requestId !== requestIdRef.current) return
        setFetched({
          matchId,
          eventId,
          result: { kind: 'ready', intelligence },
        })
      } catch (error) {
        if (cancelled || requestId !== requestIdRef.current) return
        if (error instanceof DecisionNotFoundError) {
          setFetched({
            matchId,
            eventId,
            result: {
              kind: 'not-found',
              code: error.code,
              message: error.message,
            },
          })
          return
        }
        if (error instanceof EventIntelligenceUnavailableError) {
          setFetched({
            matchId,
            eventId,
            result: { kind: 'unavailable', message: error.message },
          })
          return
        }
        const message =
          error instanceof MatchApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Unknown error loading event intelligence'
        setFetched({
          matchId,
          eventId,
          result: { kind: 'error', message, retryable: true },
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, eventId, matchId, retryToken])

  const retry = useCallback(() => {
    if (!enabled || !matchId || !eventId) return
    setFetched(null)
    setRetryToken((value) => value + 1)
  }, [enabled, eventId, matchId])

  if (!enabled || !matchId || !eventId) {
    return { state: { status: 'idle' } as const, retry }
  }

  if (!fetched || fetched.matchId !== matchId || fetched.eventId !== eventId) {
    return {
      state: { status: 'loading', matchId, eventId } as const,
      retry,
    }
  }

  if (fetched.result.kind === 'ready') {
    return {
      state: {
        status: 'ready' as const,
        matchId,
        eventId,
        intelligence: fetched.result.intelligence,
      },
      retry,
    }
  }
  if (fetched.result.kind === 'unavailable') {
    return {
      state: {
        status: 'unavailable' as const,
        matchId,
        eventId,
        message: fetched.result.message,
      },
      retry,
    }
  }
  if (fetched.result.kind === 'not-found') {
    return {
      state: {
        status: 'not-found' as const,
        matchId,
        eventId,
        code: fetched.result.code,
        message: fetched.result.message,
      },
      retry,
    }
  }
  return {
    state: {
      status: 'error' as const,
      matchId,
      eventId,
      message: fetched.result.message,
      retryable: fetched.result.retryable,
    },
    retry,
  }
}
