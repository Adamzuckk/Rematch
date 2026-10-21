import { useCallback, useEffect, useRef, useState } from 'react'
import type { DecisionNarrativeResponse } from '../types'
import {
  DecisionNarrativeUnavailableError,
  MatchApiError,
  matchService,
} from '../services/matches'

export type DecisionNarrativeState =
  | { status: 'idle' }
  | { status: 'loading'; matchId: string; eventId: string }
  | {
      status: 'ready'
      matchId: string
      eventId: string
      response: DecisionNarrativeResponse
    }
  | {
      status: 'unavailable'
      matchId: string
      eventId: string
      message: string
    }
  | {
      status: 'error'
      matchId: string
      eventId: string
      message: string
    }

type FetchResult =
  | { kind: 'ready'; response: DecisionNarrativeResponse }
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string }

/**
 * Loads only the backend-composed narrative. The Decision Explorer continues
 * to use its existing analysis response as the source of scores and rankings.
 */
export function useDecisionNarrative(
  matchId: string | undefined,
  eventId: string | undefined,
  enabled: boolean,
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
        const response = await matchService.getDecisionNarrative(matchId, eventId)
        if (cancelled || requestId !== requestIdRef.current) return
        setFetched({ matchId, eventId, result: { kind: 'ready', response } })
      } catch (error) {
        if (cancelled || requestId !== requestIdRef.current) return
        if (error instanceof DecisionNarrativeUnavailableError) {
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
              : 'Unknown error loading narrative'
        setFetched({ matchId, eventId, result: { kind: 'error', message } })
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
        response: fetched.result.response,
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
  return {
    state: {
      status: 'error' as const,
      matchId,
      eventId,
      message: fetched.result.message,
    },
    retry,
  }
}
