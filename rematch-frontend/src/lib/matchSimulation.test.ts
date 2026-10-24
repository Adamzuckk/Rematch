import { describe, expect, it } from 'vitest'
import type { MatchEvent, MatchFrame, Player } from '../types'
import {
  SIM_SEGMENT_MS,
  buildSimulationTimeline,
  eventIndexForTimeMs,
  lerpPoint,
  sampleSimulation,
  timeMsForEventIndex,
} from './matchSimulation'

const players: Player[] = [
  { id: 'p-passer', name: 'Jamie Cole', teamId: 'home', shirtNumber: 8 },
  { id: 'p-receiver', name: 'Leo Park', teamId: 'home', shirtNumber: 11 },
  { id: 'p-anon', name: '', teamId: 'away', shirtNumber: 4 },
]

const pass: MatchEvent = {
  id: 'evt-pass',
  matchId: 'm1',
  type: 'pass',
  minute: 12,
  teamId: 'home',
  playerId: 'p-passer',
  receiverId: 'p-receiver',
  start: { x: 20, y: 40 },
  end: { x: 60, y: 55 },
  outcome: 'complete',
  provenance: 'synthetic',
}

const carry: MatchEvent = {
  id: 'evt-carry',
  matchId: 'm1',
  type: 'carry',
  minute: 18,
  teamId: 'home',
  playerId: 'p-passer',
  start: { x: 60, y: 55 },
  end: { x: 75, y: 50 },
  provenance: 'synthetic',
}

const shot: MatchEvent = {
  id: 'evt-shot',
  matchId: 'm1',
  type: 'shot',
  minute: 22,
  teamId: 'home',
  playerId: 'p-passer',
  location: { x: 88, y: 50 },
  outcome: 'goal',
  provenance: 'synthetic',
}

describe('matchSimulation', () => {
  it('lerps points smoothly between known positions', () => {
    expect(lerpPoint({ x: 0, y: 0 }, { x: 100, y: 50 }, 0.5)).toEqual({
      x: 50,
      y: 25,
    })
  })

  it('builds event-derived keyframes and interpolates ball during a pass', () => {
    const timeline = buildSimulationTimeline([pass, carry], [], players)
    expect(timeline.hasEventDerivedMotion).toBe(true)
    expect(timeline.hasMeasuredFrames).toBe(false)
    expect(timeline.keyframes).toHaveLength(2)

    const mid = sampleSimulation(timeline, SIM_SEGMENT_MS * 0.5)
    expect(mid.ball).not.toBeNull()
    expect(mid.ball!.source).toBe('interpolated')
    // Arriving at carry: ball follows carry start→end path.
    expect(mid.ball!.position.x).toBeCloseTo(67.5, 5)
    expect(mid.carrierId).toBe('p-passer')

    const passMid = sampleSimulation(timeline, SIM_SEGMENT_MS * 0) // at pass
    expect(passMid.players.some((p) => p.name === 'Jamie Cole')).toBe(true)
    expect(passMid.players.some((p) => p.name === 'Leo Park')).toBe(true)
  })

  it('interpolates ball along pass path while transitioning into the pass keyframe', () => {
    const early: MatchEvent = {
      ...shot,
      id: 'evt-early',
      minute: 10,
      location: { x: 10, y: 50 },
    }
    const timeline = buildSimulationTimeline([early, pass], [], players)
    const mid = sampleSimulation(timeline, SIM_SEGMENT_MS * 0.5)
    expect(mid.ball!.position.x).toBeCloseTo(40, 5)
    expect(mid.ball!.position.y).toBeCloseTo(47.5, 5)
    expect(mid.receiverId).toBe('p-receiver')
  })

  it('interpolates measured frame players between consecutive frames', () => {
    const frames: MatchFrame[] = [
      {
        id: 'f1',
        matchId: 'm1',
        eventId: 'evt-pass',
        players: [
          {
            playerId: 'p-passer',
            teamId: 'home',
            position: { x: 20, y: 40 },
          },
          {
            playerId: 'p-receiver',
            teamId: 'home',
            position: { x: 50, y: 50 },
          },
        ],
        ball: { position: { x: 20, y: 40 } },
        provenance: 'synthetic',
      },
      {
        id: 'f2',
        matchId: 'm1',
        eventId: 'evt-carry',
        players: [
          {
            playerId: 'p-passer',
            teamId: 'home',
            position: { x: 40, y: 44 },
          },
          {
            playerId: 'p-receiver',
            teamId: 'home',
            position: { x: 70, y: 60 },
          },
        ],
        ball: { position: { x: 40, y: 44 } },
        provenance: 'synthetic',
      },
    ]
    const timeline = buildSimulationTimeline([pass, carry], frames, players)
    expect(timeline.hasMeasuredFrames).toBe(true)
    const mid = sampleSimulation(timeline, SIM_SEGMENT_MS * 0.5)
    const mover = mid.players.find((p) => p.playerId === 'p-passer')
    expect(mover?.position.x).toBeCloseTo(30, 5)
    expect(mover?.source).toBe('interpolated')
  })

  it('respects reduced-motion by snapping instead of interpolating', () => {
    const timeline = buildSimulationTimeline([pass, carry], [], players)
    const before = sampleSimulation(timeline, SIM_SEGMENT_MS * 0.25, {
      reducedMotion: true,
    })
    const after = sampleSimulation(timeline, SIM_SEGMENT_MS * 0.75, {
      reducedMotion: true,
    })
    expect(before.motionMode).toBe('reduced')
    expect(before.eventId).toBe('evt-pass')
    expect(after.eventId).toBe('evt-carry')
    expect(before.segmentProgress).toBe(0)
    expect(after.segmentProgress).toBe(1)
  })

  it('maps seek indices without corrupting timeline duration', () => {
    const timeline = buildSimulationTimeline([pass, carry, shot], [], players)
    expect(timeMsForEventIndex(2)).toBe(SIM_SEGMENT_MS * 2)
    expect(eventIndexForTimeMs(SIM_SEGMENT_MS * 1.2, timeline)).toBe(1)
    expect(eventIndexForTimeMs(timeline.durationMs, timeline)).toBe(2)
  })

  it('never invents player names for missing metadata', () => {
    const anonEvent: MatchEvent = {
      id: 'evt-anon',
      matchId: 'm1',
      type: 'pressure',
      minute: 30,
      teamId: 'away',
      playerId: 'p-anon',
      location: { x: 40, y: 40 },
      provenance: 'synthetic',
    }
    const missing: MatchEvent = {
      id: 'evt-missing',
      matchId: 'm1',
      type: 'tackle',
      minute: 33,
      teamId: 'away',
      playerId: 'p-unknown',
      location: { x: 42, y: 42 },
      provenance: 'synthetic',
    }
    const timeline = buildSimulationTimeline(
      [anonEvent, missing],
      [],
      players,
    )
    const state = sampleSimulation(timeline, 0)
    const anon = state.players.find((p) => p.playerId === 'p-anon')
    const unknown = sampleSimulation(timeline, SIM_SEGMENT_MS).players.find(
      (p) => p.playerId === 'p-unknown',
    )
    expect(anon?.name).toBeNull()
    expect(anon?.generic).toBe(true)
    expect(unknown?.name).toBeNull()
    expect(unknown?.generic).toBe(true)
  })

  it('exposes continuous minute between events for playhead sync', () => {
    const timeline = buildSimulationTimeline([pass, carry], [], players)
    const mid = sampleSimulation(timeline, SIM_SEGMENT_MS * 0.5)
    expect(mid.minute).toBeCloseTo(15, 5)
  })
})
