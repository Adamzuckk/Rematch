import type { MatchEvent, PitchPoint } from '../../types'
import { isValidPitchPoint } from '../../types/coordinates'

export interface EventPath {
  start: PitchPoint
  end: PitchPoint
}

export interface EventGeometry {
  /** Primary location marker when a single point is available */
  location?: PitchPoint
  /** Path overlay for pass/carry when both ends exist */
  path?: EventPath
}

/**
 * Extracts drawable geometry from an event without inventing coordinates.
 */
export function getEventGeometry(event: MatchEvent): EventGeometry {
  switch (event.type) {
    case 'pass':
    case 'carry': {
      const start = event.start
      const end = event.end
      const validStart = start && isValidPitchPoint(start) ? start : undefined
      const validEnd = end && isValidPitchPoint(end) ? end : undefined
      if (validStart && validEnd) {
        return { path: { start: validStart, end: validEnd }, location: validEnd }
      }
      if (validStart) return { location: validStart }
      if (validEnd) return { location: validEnd }
      return {}
    }
    case 'shot':
    case 'tackle':
    case 'pressure':
      return event.location && isValidPitchPoint(event.location)
        ? { location: event.location }
        : {}
    case 'possession_change':
      return {}
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

/** Events that open Decision Explorer (pass / shot / carry). */
export function isDecisionCandidate(event: MatchEvent): boolean {
  return (
    event.type === 'pass' || event.type === 'shot' || event.type === 'carry'
  )
}
