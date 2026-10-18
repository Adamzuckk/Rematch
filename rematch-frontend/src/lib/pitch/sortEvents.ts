import type { MatchEvent } from '../../types'

/**
 * Orders events by match clock, then occurredAt, then id (deterministic).
 */
export function sortMatchEvents(events: readonly MatchEvent[]): MatchEvent[] {
  return [...events].sort((a, b) => {
    const minuteA = a.minute ?? Number.POSITIVE_INFINITY
    const minuteB = b.minute ?? Number.POSITIVE_INFINITY
    if (minuteA !== minuteB) return minuteA - minuteB

    const timeA = a.occurredAt ?? ''
    const timeB = b.occurredAt ?? ''
    if (timeA !== timeB) return timeA.localeCompare(timeB)

    return a.id.localeCompare(b.id)
  })
}

export function formatEventMinute(minute: number | undefined): string {
  if (minute == null || !Number.isFinite(minute)) return '—'
  return `${minute}'`
}
