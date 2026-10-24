import type {
  MatchEvent,
  MatchFrame,
  PitchPoint,
  Player,
} from '../types'
import { getEventGeometry } from './pitch/eventGeometry'
import { resolveFrameForEvent } from './pitch/resolveFrame'

/** Base wall-clock duration of one event-to-event segment at 1× playback. */
export const SIM_SEGMENT_MS = 1200

export type PositionSource = 'frame' | 'event_derived' | 'interpolated'

export type SimPlayerRole = 'carrier' | 'receiver' | 'actor' | 'other'

export interface SimPlayerState {
  playerId: string
  teamId: string
  position: PitchPoint
  /** Roster name when known — never fabricated. */
  name: string | null
  shirtNumber?: number
  role: SimPlayerRole
  source: PositionSource
  /** True when roster metadata is missing (generic marker). */
  generic: boolean
}

export interface SimBallState {
  position: PitchPoint
  source: PositionSource
}

export interface SimulationKeyframe {
  timeMs: number
  eventId: string
  eventIndex: number
  minute: number
  players: SimPlayerState[]
  ball: SimBallState | null
  /** Optional path the ball follows while arriving at this keyframe. */
  incomingBallPath: { start: PitchPoint; end: PitchPoint } | null
  /** Optional path the carrier follows while arriving (carry / dribbled ball). */
  incomingCarryPath: { start: PitchPoint; end: PitchPoint } | null
  snapshotSource: 'frame' | 'event_derived'
  carrierId: string | null
  receiverId: string | null
}

export interface SimulationTimeline {
  keyframes: SimulationKeyframe[]
  durationMs: number
  segmentMs: number
  hasMeasuredFrames: boolean
  hasEventDerivedMotion: boolean
}

export interface SampledSimulationState {
  timeMs: number
  eventId: string | null
  eventIndex: number
  /** Continuous match minute for timeline / chart playheads. */
  minute: number
  segmentProgress: number
  players: SimPlayerState[]
  ball: SimBallState | null
  carrierId: string | null
  receiverId: string | null
  motionMode: 'interpolated' | 'reduced' | 'static'
  snapshotSource: 'frame' | 'event_derived' | 'mixed' | null
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function lerpPoint(
  a: PitchPoint,
  b: PitchPoint,
  t: number,
): PitchPoint {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  }
}

function playerLookup(
  players: readonly Player[],
): Map<string, Player> {
  return new Map(players.map((player) => [player.id, player]))
}

function resolveName(
  playerId: string,
  roster: Map<string, Player>,
): { name: string | null; shirtNumber?: number; generic: boolean } {
  const known = roster.get(playerId)
  if (!known) return { name: null, shirtNumber: undefined, generic: true }
  const trimmed = known.name?.trim()
  if (!trimmed) {
    return {
      name: null,
      shirtNumber: known.shirtNumber,
      generic: true,
    }
  }
  return {
    name: trimmed,
    shirtNumber: known.shirtNumber,
    generic: false,
  }
}

function eventPoint(event: MatchEvent): PitchPoint | null {
  const geometry = getEventGeometry(event)
  return geometry.location ?? geometry.path?.end ?? geometry.path?.start ?? null
}

function eventRoles(event: MatchEvent): {
  carrierId: string | null
  receiverId: string | null
  actorId: string | null
} {
  const actorId = event.playerId ?? null
  if (event.type === 'pass') {
    return {
      actorId,
      carrierId: actorId,
      receiverId: event.receiverId ?? null,
    }
  }
  if (event.type === 'carry') {
    return { actorId, carrierId: actorId, receiverId: null }
  }
  if (event.type === 'shot') {
    return { actorId, carrierId: actorId, receiverId: null }
  }
  return { actorId, carrierId: null, receiverId: null }
}

function buildEventDerivedPlayers(
  event: MatchEvent,
  roster: Map<string, Player>,
): SimPlayerState[] {
  const roles = eventRoles(event)
  const out: SimPlayerState[] = []
  const seen = new Set<string>()

  const push = (
    playerId: string | null,
    teamId: string | undefined,
    position: PitchPoint | null,
    role: SimPlayerRole,
  ) => {
    if (!playerId || !position || !teamId || seen.has(playerId)) return
    seen.add(playerId)
    const meta = resolveName(playerId, roster)
    out.push({
      playerId,
      teamId,
      position,
      name: meta.name,
      shirtNumber: meta.shirtNumber,
      role,
      source: 'event_derived',
      generic: meta.generic,
    })
  }

  if (event.type === 'pass') {
    push(roles.actorId, event.teamId, event.start ?? event.end ?? null, 'carrier')
    push(
      roles.receiverId,
      event.teamId,
      event.end ?? null,
      'receiver',
    )
  } else if (event.type === 'carry') {
    push(roles.actorId, event.teamId, event.end ?? event.start ?? null, 'carrier')
  } else if (
    event.type === 'shot' ||
    event.type === 'tackle' ||
    event.type === 'pressure' ||
    event.type === 'foul' ||
    event.type === 'yellow_card' ||
    event.type === 'red_card' ||
    event.type === 'offside' ||
    event.type === 'counter_press' ||
    event.type === 'substitution'
  ) {
    const location =
      'location' in event ? (event.location ?? null) : null
    push(roles.actorId, event.teamId, location, 'actor')
  } else if (
    event.type === 'counterattack' ||
    event.type === 'reverse_attack'
  ) {
    push(roles.actorId, event.teamId, event.end ?? event.start ?? null, 'carrier')
  }

  return out
}

function buildFramePlayers(
  frame: MatchFrame,
  event: MatchEvent,
  roster: Map<string, Player>,
): SimPlayerState[] {
  const roles = eventRoles(event)
  return frame.players.map((player) => {
    const meta = resolveName(player.playerId, roster)
    let role: SimPlayerRole = 'other'
    if (roles.carrierId && player.playerId === roles.carrierId) {
      role = event.type === 'pass' || event.type === 'carry' || event.type === 'shot'
        ? 'carrier'
        : 'actor'
    } else if (roles.receiverId && player.playerId === roles.receiverId) {
      role = 'receiver'
    } else if (roles.actorId && player.playerId === roles.actorId) {
      role = 'actor'
    }
    return {
      playerId: player.playerId,
      teamId: player.teamId,
      position: player.position,
      name: meta.name,
      shirtNumber: meta.shirtNumber,
      role,
      source: 'frame' as const,
      generic: meta.generic,
    }
  })
}

function incomingPaths(event: MatchEvent): {
  ball: { start: PitchPoint; end: PitchPoint } | null
  carry: { start: PitchPoint; end: PitchPoint } | null
} {
  if (event.type === 'pass' && event.start && event.end) {
    return { ball: { start: event.start, end: event.end }, carry: null }
  }
  if (event.type === 'carry' && event.start && event.end) {
    const path = { start: event.start, end: event.end }
    return { ball: path, carry: path }
  }
  if (
    (event.type === 'counterattack' || event.type === 'reverse_attack') &&
    event.start &&
    event.end
  ) {
    return { ball: { start: event.start, end: event.end }, carry: null }
  }
  if (event.type === 'shot' && event.location && event.playerId) {
    // Shot: ball ends at location; no start on event — no fabricated launch point.
    return { ball: null, carry: null }
  }
  return { ball: null, carry: null }
}

/**
 * Builds a deterministic playback timeline from verified events and optional
 * event-aligned frames. Does not invent tracking samples.
 */
export function buildSimulationTimeline(
  events: readonly MatchEvent[],
  frames: readonly MatchFrame[],
  players: readonly Player[],
  segmentMs: number = SIM_SEGMENT_MS,
): SimulationTimeline {
  const roster = playerLookup(players)
  const keyframes: SimulationKeyframe[] = []
  let hasMeasuredFrames = false
  let hasEventDerivedMotion = false

  events.forEach((event, eventIndex) => {
    const frame = resolveFrameForEvent(frames, event)
    const roles = eventRoles(event)
    const paths = incomingPaths(event)
    const minute =
      event.minute != null && Number.isFinite(event.minute) ? event.minute : 0

    if (frame) {
      hasMeasuredFrames = true
      const framePlayers = buildFramePlayers(frame, event, roster)
      keyframes.push({
        timeMs: eventIndex * segmentMs,
        eventId: event.id,
        eventIndex,
        minute,
        players: framePlayers,
        ball: frame.ball
          ? { position: frame.ball.position, source: 'frame' }
          : paths.ball
            ? { position: paths.ball.end, source: 'event_derived' }
            : eventPoint(event)
              ? { position: eventPoint(event)!, source: 'event_derived' }
              : null,
        incomingBallPath: paths.ball,
        incomingCarryPath: paths.carry,
        snapshotSource: 'frame',
        carrierId: roles.carrierId,
        receiverId: roles.receiverId,
      })
      return
    }

    const derivedPlayers = buildEventDerivedPlayers(event, roster)
    const point = eventPoint(event)
    if (derivedPlayers.length > 0 || point || paths.ball) {
      hasEventDerivedMotion = true
    }
    keyframes.push({
      timeMs: eventIndex * segmentMs,
      eventId: event.id,
      eventIndex,
      minute,
      players: derivedPlayers,
      ball: paths.ball
        ? { position: paths.ball.end, source: 'event_derived' }
        : point
          ? { position: point, source: 'event_derived' }
          : null,
      incomingBallPath: paths.ball,
      incomingCarryPath: paths.carry,
      snapshotSource: 'event_derived',
      carrierId: roles.carrierId,
      receiverId: roles.receiverId,
    })
  })

  const durationMs =
    keyframes.length <= 1
      ? 0
      : (keyframes.length - 1) * segmentMs

  return {
    keyframes,
    durationMs,
    segmentMs,
    hasMeasuredFrames,
    hasEventDerivedMotion,
  }
}

function mergePlayerMaps(
  from: readonly SimPlayerState[],
  to: readonly SimPlayerState[],
  t: number,
  reducedMotion: boolean,
): SimPlayerState[] {
  const toMap = new Map(to.map((player) => [player.playerId, player]))
  const fromMap = new Map(from.map((player) => [player.playerId, player]))
  const ids = new Set([...fromMap.keys(), ...toMap.keys()])
  const result: SimPlayerState[] = []

  for (const id of ids) {
    const a = fromMap.get(id)
    const b = toMap.get(id)
    if (a && b) {
      const useB = reducedMotion || t >= 1
      const useA = reducedMotion ? t < 0.5 : t <= 0
      const position =
        useA ? a.position : useB ? b.position : lerpPoint(a.position, b.position, t)
      result.push({
        ...b,
        position,
        role: t < 0.5 ? a.role : b.role,
        source:
          reducedMotion || t <= 0 || t >= 1
            ? b.source
            : a.source === 'frame' && b.source === 'frame'
              ? 'interpolated'
              : 'interpolated',
      })
      continue
    }
    if (b && !a) {
      // Appear at destination once the segment is underway; avoid fabricating prior coords.
      if (reducedMotion ? t >= 0.5 : t > 0.05) result.push({ ...b })
      continue
    }
    if (a && !b) {
      if (reducedMotion ? t < 0.5 : t < 0.95) result.push({ ...a })
    }
  }

  return result
}

function sampleBall(
  from: SimulationKeyframe,
  to: SimulationKeyframe,
  t: number,
  reducedMotion: boolean,
): SimBallState | null {
  if (reducedMotion) {
    return t < 0.5 ? from.ball : to.ball
  }

  // Prefer verified event path when arriving at a pass/carry without a measured
  // destination ball, or when the destination keyframe itself is event-derived.
  if (
    to.incomingBallPath &&
    t > 0 &&
    (to.snapshotSource === 'event_derived' || !to.ball || to.ball.source !== 'frame')
  ) {
    return {
      position: lerpPoint(
        to.incomingBallPath.start,
        to.incomingBallPath.end,
        t,
      ),
      source: 'interpolated',
    }
  }

  if (from.ball && to.ball) {
    if (t <= 0) return from.ball
    if (t >= 1) return to.ball
    return {
      position: lerpPoint(from.ball.position, to.ball.position, t),
      source: 'interpolated',
    }
  }
  if (to.ball && t >= 0.5) return to.ball
  if (from.ball && t < 0.5) return from.ball
  return to.ball ?? from.ball
}

function applyCarryOverride(
  players: SimPlayerState[],
  to: SimulationKeyframe,
  t: number,
  reducedMotion: boolean,
): SimPlayerState[] {
  // Only override when the destination keyframe is event-derived. Measured
  // frames already place the carrier; do not replace tracking with path math.
  if (
    to.snapshotSource !== 'event_derived' ||
    !to.incomingCarryPath ||
    !to.carrierId ||
    reducedMotion
  ) {
    return players
  }
  return players.map((player) => {
    if (player.playerId !== to.carrierId) return player
    return {
      ...player,
      position: lerpPoint(
        to.incomingCarryPath!.start,
        to.incomingCarryPath!.end,
        t,
      ),
      role: 'carrier',
      source: 'interpolated',
    }
  })
}

/**
 * Samples the simulation at a continuous playback clock time.
 * `timeMs` is segment-based (0 … durationMs), not wall-clock match minutes.
 */
export function sampleSimulation(
  timeline: SimulationTimeline,
  timeMs: number,
  options?: { reducedMotion?: boolean },
): SampledSimulationState {
  const reducedMotion = options?.reducedMotion === true
  const keyframes = timeline.keyframes

  if (keyframes.length === 0) {
    return {
      timeMs: 0,
      eventId: null,
      eventIndex: -1,
      minute: 0,
      segmentProgress: 0,
      players: [],
      ball: null,
      carrierId: null,
      receiverId: null,
      motionMode: 'static',
      snapshotSource: null,
    }
  }

  if (keyframes.length === 1) {
    const only = keyframes[0]!
    return {
      timeMs: 0,
      eventId: only.eventId,
      eventIndex: 0,
      minute: only.minute,
      segmentProgress: 0,
      players: only.players,
      ball: only.ball,
      carrierId: only.carrierId,
      receiverId: only.receiverId,
      motionMode: 'static',
      snapshotSource: only.snapshotSource,
    }
  }

  const segmentMs = timeline.segmentMs
  const clamped = Math.min(Math.max(timeMs, 0), timeline.durationMs)
  const rawIndex = segmentMs > 0 ? clamped / segmentMs : 0
  const fromIndex = Math.min(
    Math.floor(rawIndex),
    keyframes.length - 2,
  )
  const t = clamp01(rawIndex - fromIndex)
  const from = keyframes[fromIndex]!
  const to = keyframes[fromIndex + 1]!

  const effectiveT = reducedMotion ? (t < 0.5 ? 0 : 1) : t
  let players = mergePlayerMaps(from.players, to.players, effectiveT, reducedMotion)
  players = applyCarryOverride(players, to, effectiveT, reducedMotion)
  const ball = sampleBall(from, to, effectiveT, reducedMotion)

  const minute = lerp(from.minute, to.minute, effectiveT)
  const atTo = effectiveT >= 1 - 1e-6
  const active = atTo ? to : from

  let snapshotSource: SampledSimulationState['snapshotSource'] = active.snapshotSource
  if (
    !reducedMotion &&
    effectiveT > 0 &&
    effectiveT < 1 &&
    from.snapshotSource !== to.snapshotSource
  ) {
    snapshotSource = 'mixed'
  } else if (!reducedMotion && effectiveT > 0 && effectiveT < 1) {
    snapshotSource =
      from.snapshotSource === 'frame' && to.snapshotSource === 'frame'
        ? 'frame'
        : 'mixed'
  }

  return {
    timeMs: clamped,
    eventId: active.eventId,
    eventIndex: active.eventIndex,
    minute,
    segmentProgress: effectiveT,
    players,
    ball,
    carrierId: to.carrierId ?? from.carrierId,
    receiverId: to.receiverId ?? from.receiverId,
    motionMode: reducedMotion
      ? 'reduced'
      : effectiveT > 0 && effectiveT < 1
        ? 'interpolated'
        : 'static',
    snapshotSource,
  }
}

/** Playback clock time for a selected event index (seek target). */
export function timeMsForEventIndex(
  eventIndex: number,
  segmentMs: number = SIM_SEGMENT_MS,
): number {
  if (eventIndex < 0) return 0
  return eventIndex * segmentMs
}

export function eventIndexForTimeMs(
  timeMs: number,
  timeline: SimulationTimeline,
): number {
  if (timeline.keyframes.length === 0) return -1
  if (timeline.keyframes.length === 1) return 0
  const raw =
    timeline.segmentMs > 0 ? timeMs / timeline.segmentMs : 0
  // Select the event we are departing from until the next keyframe is reached.
  const idx = Math.floor(raw + 1e-9)
  return Math.min(Math.max(idx, 0), timeline.keyframes.length - 1)
}
