import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatchEvent, Player } from '../types'
import { SIM_SEGMENT_MS, buildSimulationTimeline } from '../lib/matchSimulation'
import { useMatchPlaybackClock } from './useMatchPlaybackClock'

const players: Player[] = [
  { id: 'p1', name: 'Jamie Cole', teamId: 'home' },
]

const events: MatchEvent[] = [
  {
    id: 'e0',
    matchId: 'm1',
    type: 'pass',
    minute: 10,
    teamId: 'home',
    playerId: 'p1',
    start: { x: 20, y: 40 },
    end: { x: 40, y: 50 },
    provenance: 'synthetic',
  },
  {
    id: 'e1',
    matchId: 'm1',
    type: 'carry',
    minute: 20,
    teamId: 'home',
    playerId: 'p1',
    start: { x: 40, y: 50 },
    end: { x: 60, y: 55 },
    provenance: 'synthetic',
  },
  {
    id: 'e2',
    matchId: 'm1',
    type: 'shot',
    minute: 30,
    teamId: 'home',
    playerId: 'p1',
    location: { x: 85, y: 50 },
    outcome: 'goal',
    provenance: 'synthetic',
  },
]

describe('useMatchPlaybackClock', () => {
  let rafQueue: FrameRequestCallback[]
  let now = 0

  beforeEach(() => {
    rafQueue = []
    now = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb)
      return rafQueue.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function flushFrames(count: number, stepMs: number) {
    for (let i = 0; i < count; i += 1) {
      const cb = rafQueue.shift()
      if (!cb) break
      now += stepMs
      act(() => {
        cb(now)
      })
    }
  }

  it('advances with speed, freezes on pause, and resumes from the same point', () => {
    const timeline = buildSimulationTimeline(events, [], players)
    const onArrive = vi.fn()
    const onEnded = vi.fn()

    const { result, rerender } = renderHook(
      (props: { playing: boolean; speed: 1 | 2 }) =>
        useMatchPlaybackClock({
          timeline,
          playing: props.playing,
          speed: props.speed,
          seekEventIndex: 0,
          seekGeneration: 0,
          onArriveEventIndex: onArrive,
          onPlaybackEnded: onEnded,
        }),
      { initialProps: { playing: true, speed: 1 as const } },
    )

    // First frame primes last timestamp; second applies delta.
    flushFrames(1, 16)
    flushFrames(1, 100)
    expect(result.current.timeMs).toBe(100)

    rerender({ playing: false, speed: 1 })
    const frozen = result.current.timeMs
    rafQueue = []
    flushFrames(3, 100)
    expect(result.current.timeMs).toBe(frozen)

    rerender({ playing: true, speed: 2 })
    flushFrames(1, 16)
    flushFrames(1, 50)
    // delta 50 * speed 2 = 100
    expect(result.current.timeMs).toBe(frozen + 100)
  })

  it('seeks to an event index without corrupting the shared clock', () => {
    const timeline = buildSimulationTimeline(events, [], players)
    const { result, rerender } = renderHook(
      (props: { seekEventIndex: number; seekGeneration: number }) =>
        useMatchPlaybackClock({
          timeline,
          playing: false,
          speed: 1,
          seekEventIndex: props.seekEventIndex,
          seekGeneration: props.seekGeneration,
          onArriveEventIndex: () => undefined,
          onPlaybackEnded: () => undefined,
        }),
      { initialProps: { seekEventIndex: 0, seekGeneration: 0 } },
    )

    expect(result.current.timeMs).toBe(0)

    rerender({ seekEventIndex: 2, seekGeneration: 1 })
    expect(result.current.timeMs).toBe(SIM_SEGMENT_MS * 2)
    expect(result.current.eventIndex).toBe(2)
  })

  it('notifies when the playhead crosses into the next event', () => {
    const timeline = buildSimulationTimeline(events, [], players)
    const onArrive = vi.fn()

    renderHook(() =>
      useMatchPlaybackClock({
        timeline,
        playing: true,
        speed: 1,
        seekEventIndex: 0,
        seekGeneration: 0,
        onArriveEventIndex: onArrive,
        onPlaybackEnded: () => undefined,
      }),
    )

    // Delta per frame is capped at 100ms — advance enough frames to cross a segment.
    flushFrames(1, 16)
    flushFrames(13, 100)
    expect(onArrive).toHaveBeenCalledWith(1)
  })
})
