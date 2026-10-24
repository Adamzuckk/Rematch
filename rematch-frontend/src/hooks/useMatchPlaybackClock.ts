import { useEffect, useRef, useState } from 'react'
import type { MatchReplaySpeed } from '../lib/matchReplay'
import {
  SIM_SEGMENT_MS,
  eventIndexForTimeMs,
  timeMsForEventIndex,
  type SimulationTimeline,
} from '../lib/matchSimulation'

export interface MatchPlaybackClockState {
  timeMs: number
  /** Event index currently owning the playhead (floor of segment clock). */
  eventIndex: number
}

function readReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(media.matches)
    onChange()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }
    media.addListener(onChange)
    return () => media.removeListener(onChange)
  }, [])

  return reduced
}

/**
 * Shared continuous playback clock for match simulation.
 * Advances with requestAnimationFrame; pause freezes; seek snaps without drift.
 */
export function useMatchPlaybackClock({
  timeline,
  playing,
  speed,
  seekEventIndex,
  seekGeneration,
  onArriveEventIndex,
  onPlaybackEnded,
}: {
  timeline: SimulationTimeline
  playing: boolean
  speed: MatchReplaySpeed
  seekEventIndex: number
  seekGeneration: number
  onArriveEventIndex: (eventIndex: number) => void
  onPlaybackEnded: () => void
}): MatchPlaybackClockState {
  const segmentMs = timeline.segmentMs || SIM_SEGMENT_MS
  const seekTimeMs = timeMsForEventIndex(Math.max(seekEventIndex, 0), segmentMs)

  const [timeMs, setTimeMs] = useState(seekTimeMs)
  const [appliedSeekGeneration, setAppliedSeekGeneration] =
    useState(seekGeneration)

  let displayTimeMs = timeMs
  if (seekGeneration !== appliedSeekGeneration) {
    setAppliedSeekGeneration(seekGeneration)
    setTimeMs(seekTimeMs)
    displayTimeMs = seekTimeMs
  }

  const timeRef = useRef(displayTimeMs)
  const lastFrameRef = useRef<number | null>(null)
  const lastEmittedIndexRef = useRef(seekEventIndex)
  const onArriveRef = useRef(onArriveEventIndex)
  const onEndedRef = useRef(onPlaybackEnded)

  useEffect(() => {
    timeRef.current = displayTimeMs
  }, [displayTimeMs])

  useEffect(() => {
    onArriveRef.current = onArriveEventIndex
    onEndedRef.current = onPlaybackEnded
  }, [onArriveEventIndex, onPlaybackEnded])

  useEffect(() => {
    lastEmittedIndexRef.current = seekEventIndex
    lastFrameRef.current = null
  }, [seekGeneration, seekEventIndex])

  useEffect(() => {
    if (!playing || timeline.keyframes.length === 0) {
      lastFrameRef.current = null
      return
    }

    let raf = 0
    const tick = (now: number) => {
      const last = lastFrameRef.current
      lastFrameRef.current = now
      if (last == null) {
        raf = window.requestAnimationFrame(tick)
        return
      }

      const delta = Math.min(now - last, 100) * speed
      const next = Math.min(timeRef.current + delta, timeline.durationMs)
      timeRef.current = next
      setTimeMs(next)

      const idx = eventIndexForTimeMs(next, timeline)
      if (idx !== lastEmittedIndexRef.current && idx >= 0) {
        lastEmittedIndexRef.current = idx
        onArriveRef.current(idx)
      }

      if (next >= timeline.durationMs && timeline.durationMs > 0) {
        onEndedRef.current()
        return
      }

      raf = window.requestAnimationFrame(tick)
    }

    raf = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(raf)
      lastFrameRef.current = null
    }
  }, [playing, speed, timeline])

  const eventIndex = eventIndexForTimeMs(displayTimeMs, timeline)

  return { timeMs: displayTimeMs, eventIndex }
}
