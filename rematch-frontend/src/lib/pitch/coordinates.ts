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

