import type { MatchFrame } from '../types'

/**
 * rematch-phase2-v1 ships no player/ball frames.
 * Phase 3 pitch rendering therefore shows event overlays only unless a
 * later scenario adds frames (or tests supply controlled fixtures).
 */
export const SYNTHETIC_FRAMES: MatchFrame[] = []

export function getSyntheticFramesForMatch(matchId: string): MatchFrame[] {
  return SYNTHETIC_FRAMES.filter((frame) => frame.matchId === matchId)
}
