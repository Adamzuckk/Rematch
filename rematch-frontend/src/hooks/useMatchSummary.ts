import { useEffect, useState } from 'react'
import { matchService } from '../services/matches'
import type { MatchSummary } from '../types'

export type MatchSummaryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; match: MatchSummary }
  | { status: 'missing' }
  | { status: 'error'; message: string }

/**
 * Loads a single match summary through the match service boundary.
 */
export function useMatchSummary(matchId: string | undefined): MatchSummaryState {
  const [fetched, setFetched] = useState<{
    matchId: string
    match: MatchSummary | null
  } | null>(null)
  const [error, setError] = useState<{
    matchId: string
    message: string
  } | null>(null)

  useEffect(() => {
    if (!matchId) return

    let cancelled = false

    void matchService
      .getMatchById(matchId)
      .then((match) => {
        if (cancelled) return
        setFetched({ matchId, match })
        setError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        const message =
          cause instanceof Error ? cause.message : 'Failed to load match'
        setError({ matchId, message })
      })

    return () => {
      cancelled = true
    }
  }, [matchId])

  if (!matchId) return { status: 'idle' }
  if (error?.matchId === matchId) {
    return { status: 'error', message: error.message }
  }
  if (fetched?.matchId === matchId) {
    return fetched.match
      ? { status: 'ready', match: fetched.match }
      : { status: 'missing' }
  }
  return { status: 'loading' }
}

export function formatMatchLabel(match: MatchSummary): string {
  return `${match.homeTeam.name} vs ${match.awayTeam.name}`
}
