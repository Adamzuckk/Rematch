/**
 * Pitch coordinate convention (synthetic + future API frames).
 *
 * - Units: normalized percentage of the pitch, range 0–100 inclusive.
 * - x: along the length of the pitch (0 = left end-line, 100 = right end-line
 *   in the default SVG orientation used by ReMatch).
 * - y: along the width (0 = bottom touchline, 100 = top touchline).
 * - Origin: bottom-left of the pitch diagram.
 * - Ball and player frames use the same space so paths can be drawn without
 *   converting units in the UI.
 *
 * Coordinates are optional on events/frames. Omit them when unknown —
 * never invent positions to fill the UI.
 */
export interface PitchPoint {
  x: number
  y: number
}

export function isValidPitchPoint(point: PitchPoint): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 100 &&
    point.y >= 0 &&
    point.y <= 100
  )
}
