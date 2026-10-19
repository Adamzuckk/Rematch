import { useCallback, useEffect, useRef, useState } from 'react'
import type { DecisionAnalysis } from '../types'
import {
  DecisionInsufficientEvidenceError,
  DecisionNotFoundError,
  MatchApiError,
  matchService,
} from '../services/matches'

export type DecisionAnalysisState =
  | { status: 'idle' }
  | { status: 'loading'; matchId: string; eventId: string }
  | {
      status: 'ready'
      matchId: string
      eventId: string
      analysis: DecisionAnalysis
    }
  | {
      status: 'insufficient-evidence'
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
  | { kind: 'ready'; analysis: DecisionAnalysis }
  | { kind: 'insufficient-evidence'; message: string }
  | {
      kind: 'not-found'
      code: 'match_not_found' | 'event_not_found'
      message: string
    }
  | { kind: 'error'; message: string; retryable: boolean }

/**
 * Loads decision analysis for a match/event pair.
 * - Caches successful responses per matchId+eventId (avoids duplicate fetches).
 * - Ignores stale responses when the selection changes mid-flight.
 * - Never falls back from API mode to mock data.
 */
export function useDecisionAnalysis(
  matchId: string | undefined,
  eventId: string | undefined,
) {
  const [retryToken, setRetryToken] = useState(0)
  const [cache, setCache] = useState<Record<string, DecisionAnalysis>>({})
  const [fetched, setFetched] = useState<{
    matchId: string
    eventId: string
    result: FetchResult
  } | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!matchId || !eventId) return

    const cacheKey = `${matchId}::${eventId}`
    if (cache[cacheKey]) return

    const requestId = ++requestIdRef.current
    let cancelled = false

    void (async () => {
      try {
        const analysis = await matchService.getDecisionAnalysis(matchId, eventId)
        if (cancelled || requestId !== requestIdRef.current) return
        setCache((prev) => ({ ...prev, [cacheKey]: analysis }))
        setFetched({
          matchId,
          eventId,
          result: { kind: 'ready', analysis },
        })
      } catch (error) {
        if (cancelled || requestId !== requestIdRef.current) return

        if (error instanceof DecisionInsufficientEvidenceError) {
          setFetched({
            matchId,
            eventId,
            result: {
              kind: 'insufficient-evidence',
              message: error.message,
            },
          })
          return
        }

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

        const message =
          error instanceof MatchApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Unknown error loading decision analysis'
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
  }, [matchId, eventId, retryToken, cache])

  const retry = useCallback(() => {
    if (!matchId || !eventId) return
    const cacheKey = `${matchId}::${eventId}`
    setCache((prev) => {
      if (!(cacheKey in prev)) return prev
      const next = { ...prev }
      delete next[cacheKey]
      return next
    })
    setFetched(null)
    setRetryToken((token) => token + 1)
  }, [matchId, eventId])

  if (!matchId || !eventId) {
    return { state: { status: 'idle' } as const, retry }
  }

  const cacheKey = `${matchId}::${eventId}`
  const cached = cache[cacheKey]
  if (cached) {
    return {
      state: {
        status: 'ready' as const,
        matchId,
        eventId,
        analysis: cached,
      },
      retry,
    }
  }

  if (
    !fetched ||
    fetched.matchId !== matchId ||
    fetched.eventId !== eventId
  ) {
    return {
      state: { status: 'loading', matchId, eventId } as const,
      retry,
    }
  }

  const { result } = fetched
  if (result.kind === 'ready') {
    return {
      state: {
        status: 'ready' as const,
        matchId,
        eventId,
        analysis: result.analysis,
      },
      retry,
    }
  }
  if (result.kind === 'insufficient-evidence') {
    return {
      state: {
        status: 'insufficient-evidence' as const,
        matchId,
        eventId,
        message: result.message,
      },
      retry,
    }
  }
  if (result.kind === 'not-found') {
    return {
      state: {
        status: 'not-found' as const,
        matchId,
        eventId,
        code: result.code,
        message: result.message,
      },
      retry,
    }
  }
  return {
    state: {
      status: 'error' as const,
      matchId,
      eventId,
      message: result.message,
      retryable: result.retryable,
    },
    retry,
  }
}
