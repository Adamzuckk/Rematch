import type { MatchEvent, PitchPoint } from '../../types'

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
      if (start && end) {
        return { path: { start, end }, location: end }
      }
      if (start) return { location: start }
      if (end) return { location: end }
      return {}
    }
    case 'shot':
    case 'tackle':
    case 'pressure':
      return event.location ? { location: event.location } : {}
    case 'possession_change':
      return {}
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

/** Events that can later open the Decision Explorer (still a placeholder). */
export function isDecisionCandidate(event: MatchEvent): boolean {
  return (
    event.type === 'pass' || event.type === 'shot' || event.type === 'carry'
  )
}
