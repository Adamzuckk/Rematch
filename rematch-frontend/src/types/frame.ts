import type { PitchPoint } from './coordinates'
import type { DataProvenance } from './provenance'

/**
 * Snapshot of players and/or ball at a point in a match.
 * Frames are optional; Phase 2 ships none on the dashboard and only defines
 * the shape for Phase 3 pitch rendering.
 */
export interface PlayerFrame {
  playerId: string
  teamId: string
  position: PitchPoint
}

export interface BallFrame {
  position: PitchPoint
}

export interface MatchFrame {
  id: string
  matchId: string
  /** Link to an event when the frame is event-aligned */
  eventId?: string
  minute?: number
  occurredAt?: string
  players: PlayerFrame[]
  ball?: BallFrame
  provenance: DataProvenance
}
