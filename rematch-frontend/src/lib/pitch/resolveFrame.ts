import type { MatchEvent, MatchFrame } from '../../types'

/**
 * Picks the frame aligned to an event when available.
 * Prefers eventId match; otherwise returns undefined (never invents a frame).
 */
export function resolveFrameForEvent(
  frames: readonly MatchFrame[],
  event: MatchEvent | null,
): MatchFrame | undefined {
  if (!event || frames.length === 0) return undefined
  return frames.find(
    (frame) => frame.matchId === event.matchId && frame.eventId === event.id,
  )
}
