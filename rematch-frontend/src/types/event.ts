import type { PitchPoint } from './coordinates'
import type { DataProvenance } from './provenance'

export type MatchEventType =
  | 'pass'
  | 'shot'
  | 'carry'
  | 'tackle'
  | 'pressure'
  | 'possession_change'

interface MatchEventBase {
  id: string
  matchId: string
  /** Match clock minute when known (integer or half-minute as float) */
  minute?: number
  /** ISO-8601 timestamp within the synthetic scenario timeline, when known */
  occurredAt?: string
  teamId?: string
  playerId?: string
  provenance: DataProvenance
}

export interface PassEvent extends MatchEventBase {
  type: 'pass'
  start?: PitchPoint
  end?: PitchPoint
  receiverId?: string
  outcome?: 'complete' | 'incomplete' | 'unknown'
}

export interface ShotEvent extends MatchEventBase {
  type: 'shot'
  location?: PitchPoint
  outcome?: 'goal' | 'saved' | 'blocked' | 'off_target' | 'unknown'
}

export interface CarryEvent extends MatchEventBase {
  type: 'carry'
  start?: PitchPoint
  end?: PitchPoint
}

export interface TackleEvent extends MatchEventBase {
  type: 'tackle'
  location?: PitchPoint
  outcome?: 'won' | 'lost' | 'unknown'
}

export interface PressureEvent extends MatchEventBase {
  type: 'pressure'
  location?: PitchPoint
}

export interface PossessionChangeEvent extends MatchEventBase {
  type: 'possession_change'
  /** Team that gained possession, when known */
  gainedByTeamId?: string
}

export type MatchEvent =
  | PassEvent
  | ShotEvent
  | CarryEvent
  | TackleEvent
  | PressureEvent
  | PossessionChangeEvent
