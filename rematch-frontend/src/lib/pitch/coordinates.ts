import { isValidPitchPoint, type PitchPoint } from '../../types/coordinates'

/** SVG viewBox size — ~FIFA 105×68 proportions scaled ×10. */
export const PITCH_VIEWBOX = {
  width: 1050,
  height: 680,
} as const

export interface SvgPoint {
  x: number
  y: number
}

/**
 * Avoid binary floating-point tails in SVG attributes (for example 476 becoming
 * 475.99999999999994). Six viewBox decimals is far below a rendered pixel at
 * every supported pitch size while keeping React updates deterministic.
 */
function stableSvgCoordinate(value: number): number {
  return Number(value.toFixed(6))
}

/**
 * Maps a PitchPoint (0–100%, origin bottom-left) into SVG space
 * (origin top-left of the viewBox).
 */
export function mapPitchPointToSvg(point: PitchPoint): SvgPoint | null {
  if (!isValidPitchPoint(point)) return null
  return {
    x: stableSvgCoordinate((point.x / 100) * PITCH_VIEWBOX.width),
    y: stableSvgCoordinate(((100 - point.y) / 100) * PITCH_VIEWBOX.height),
  }
}

/**
 * Clamps a raw point into the valid pitch range when finite.
 * Returns null for non-finite values (never invents positions).
 */
export function clampPitchPoint(point: PitchPoint): PitchPoint | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
  return {
    x: Math.min(100, Math.max(0, point.x)),
    y: Math.min(100, Math.max(0, point.y)),
  }
}

export function mapPitchPointToSvgClamped(point: PitchPoint): SvgPoint | null {
  const clamped = clampPitchPoint(point)
  if (!clamped) return null
  return mapPitchPointToSvg(clamped)
}
