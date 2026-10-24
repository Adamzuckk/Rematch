import type { PitchPoint } from './coordinates'
import type { DataProvenance } from './provenance'

export type MatchEventType =
  | 'pass'
  | 'shot'
  | 'carry'
  | 'tackle'
  | 'pressure'
  | 'possession_change'
  | 'foul'
  | 'yellow_card'
  | 'red_card'
  | 'substitution'
  | 'offside'
  | 'counterattack'
  | 'reverse_attack'
  | 'counter_press'

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
  detail?: string
}

export interface ShotEvent extends MatchEventBase {
  type: 'shot'
  location?: PitchPoint
  outcome?: 'goal' | 'saved' | 'blocked' | 'off_target' | 'unknown'
  assistPlayerId?: string
  goalType?: 'open_play' | 'penalty' | 'free_kick' | 'own_goal'
  detail?: string
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
  detail?: string
}

export interface PossessionChangeEvent extends MatchEventBase {
  type: 'possession_change'
  /** Team that gained possession, when known */
  gainedByTeamId?: string
}

export interface FoulEvent extends MatchEventBase {
  type: 'foul'
  location?: PitchPoint
  relatedPlayerId?: string
  outcome?: 'conceded' | 'won' | 'unknown'
  detail?: string
}

export interface YellowCardEvent extends MatchEventBase {
  type: 'yellow_card'
  location?: PitchPoint
  detail?: string
}

export interface RedCardEvent extends MatchEventBase {
  type: 'red_card'
  location?: PitchPoint
  detail?: string
}

export interface SubstitutionEvent extends MatchEventBase {
  type: 'substitution'
  location?: PitchPoint
  relatedPlayerId?: string
  detail?: string
}

export interface OffsideEvent extends MatchEventBase {
  type: 'offside'
  location?: PitchPoint
  outcome?: 'flagged' | 'unknown'
}

export interface CounterattackEvent extends MatchEventBase {
  type: 'counterattack'
  start?: PitchPoint
  end?: PitchPoint
  detail?: string
}

export interface ReverseAttackEvent extends MatchEventBase {
  type: 'reverse_attack'
  start?: PitchPoint
  end?: PitchPoint
  detail?: string
}

export interface CounterPressEvent extends MatchEventBase {
  type: 'counter_press'
  location?: PitchPoint
  detail?: string
}

export type MatchEvent =
  | PassEvent
  | ShotEvent
  | CarryEvent
  | TackleEvent
  | PressureEvent
  | PossessionChangeEvent
  | FoulEvent
  | YellowCardEvent
  | RedCardEvent
  | SubstitutionEvent
  | OffsideEvent
  | CounterattackEvent
  | ReverseAttackEvent
  | CounterPressEvent
