import { useCallback, useEffect, useState } from 'react'
import { matchService, MatchNotFoundError } from '../services/matches'
import type {
  MatchEvent,
  MatchFrame,
  MatchSummary,
  Player,
} from '../types'

export type MatchAnalysisState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      match: MatchSummary
      events: MatchEvent[]
      players: Player[]
      frames: MatchFrame[]
    }

type FetchResult =
  | { kind: 'ready'; match: MatchSummary; events: MatchEvent[]; players: Player[]; frames: MatchFrame[] }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }

/**
 * Loads match summary, events, players, and frames through the match service.
 * Never invents positions or events when the dataset omits them.
 */
export function useMatchAnalysis(matchId: string | undefined): {
  state: MatchAnalysisState
  retry: () => void
} {
  const [reloadToken, setReloadToken] = useState(0)
  const [fetched, setFetched] = useState<{
    matchId: string
    result: FetchResult
  } | null>(null)

  const retry = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!matchId) return

    let cancelled = false
    let pollTimer: ReturnType<typeof setInterval> | undefined

    const load = async (options?: { soft?: boolean }) => {
      try {
        const match = await matchService.getMatchById(matchId)
        if (cancelled) return

        if (!match) {
          setFetched({ matchId, result: { kind: 'not-found' } })
          return
        }

        const [events, players, frames] = await Promise.all([
          matchService.getMatchEvents(matchId),
          matchService.getMatchPlayers(matchId),
          matchService.getMatchFrames(matchId),
        ])

        if (cancelled) return

        setFetched({
          matchId,
          result: { kind: 'ready', match, events, players, frames },
        })

        if (match.status === 'live' && pollTimer == null) {
          pollTimer = setInterval(() => {
            void load({ soft: true })
          }, 5_000)
        }
        if (match.status !== 'live' && pollTimer != null) {
          clearInterval(pollTimer)
          pollTimer = undefined
        }
      } catch (cause: unknown) {
        if (cancelled) return
        if (options?.soft) return
        if (cause instanceof MatchNotFoundError) {
          setFetched({ matchId, result: { kind: 'not-found' } })
          return
        }
        const message =
          cause instanceof Error ? cause.message : 'Failed to load match analysis'
        setFetched({ matchId, result: { kind: 'error', message } })
      }
    }

    void load()

    return () => {
      cancelled = true
      if (pollTimer != null) clearInterval(pollTimer)
    }
  }, [matchId, reloadToken])

  if (!matchId) {
    return { state: { status: 'idle' }, retry }
  }

  if (!fetched || fetched.matchId !== matchId) {
    return { state: { status: 'loading' }, retry }
  }

  const { result } = fetched
  if (result.kind === 'not-found') {
    return { state: { status: 'not-found' }, retry }
  }
  if (result.kind === 'error') {
    return { state: { status: 'error', message: result.message }, retry }
  }

  return {
    state: {
      status: 'ready' as const,
      match: result.match,
      events: result.events,
      players: result.players,
      frames: result.frames,
    },
    retry,
  }
}
