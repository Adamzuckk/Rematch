import type { MatchEvent } from '../types'
import { isDecisionCandidate } from './pitch'
import { sortMatchEvents } from './pitch'

export type MatchHighlightKind = 'goal' | 'shot' | 'decision' | 'significant'

export interface MatchHighlight {
  eventId: string
  kind: MatchHighlightKind
  minute: number | undefined
  eventType: MatchEvent['type']
  teamId: string | undefined
  playerId: string | undefined
}

function highlightKind(event: MatchEvent): MatchHighlightKind | null {
  if (event.type === 'shot' && event.outcome === 'goal') return 'goal'
  if (event.type === 'shot') return 'shot'
  if (isDecisionCandidate(event)) return 'decision'
  if (event.type === 'tackle' || event.type === 'pressure') return 'significant'
  return null
}

const KIND_RANK: Record<MatchHighlightKind, number> = {
  goal: 0,
  shot: 1,
  decision: 2,
  significant: 3,
}

/**
 * Build a concise highlights strip from real match events only.
 * Does not invent descriptions, xG, or missing minutes.
 */
export function buildMatchHighlights(
  events: readonly MatchEvent[],
  limit = 12,
): MatchHighlight[] {
  const items: MatchHighlight[] = []
  for (const event of sortMatchEvents([...events])) {
    const kind = highlightKind(event)
    if (!kind) continue
    items.push({
      eventId: event.id,
      kind,
      minute: event.minute,
      eventType: event.type,
      teamId: event.teamId,
      playerId: event.playerId,
    })
  }

  return items
    .sort((a, b) => {
      const kindDelta = KIND_RANK[a.kind] - KIND_RANK[b.kind]
      if (kindDelta !== 0) return kindDelta
      return (a.minute ?? 0) - (b.minute ?? 0)
    })
    .slice(0, limit)
}

export interface KeyMatchMetric {
  key: 'goals' | 'shots' | 'passes' | 'tackles'
  home: number
  away: number
}

/** Compact metric cards from event counts only (no possession/xG/distance). */
export function buildKeyMatchMetrics(
  events: readonly MatchEvent[],
  homeTeamId: string,
  awayTeamId: string,
): KeyMatchMetric[] {
  const count = (
    teamId: string,
    predicate: (event: MatchEvent) => boolean,
  ): number =>
    events.filter((event) => event.teamId === teamId && predicate(event)).length

  return [
    {
      key: 'goals',
      home: count(
        homeTeamId,
        (e) => e.type === 'shot' && e.outcome === 'goal',
      ),
      away: count(
        awayTeamId,
        (e) => e.type === 'shot' && e.outcome === 'goal',
      ),
    },
    {
      key: 'shots',
      home: count(homeTeamId, (e) => e.type === 'shot'),
      away: count(awayTeamId, (e) => e.type === 'shot'),
    },
    {
      key: 'passes',
      home: count(homeTeamId, (e) => e.type === 'pass'),
      away: count(awayTeamId, (e) => e.type === 'pass'),
    },
    {
      key: 'tackles',
      home: count(homeTeamId, (e) => e.type === 'tackle'),
      away: count(awayTeamId, (e) => e.type === 'tackle'),
    },
  ]
}
