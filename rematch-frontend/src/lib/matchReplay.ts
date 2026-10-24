import type { MatchEvent, MatchSummary } from '../types'
import { isDecisionCandidate } from './pitch/eventGeometry'

export type ReplayMode = 'full' | 'highlights'

export type MatchReplaySpeed = 1 | 2 | 4 | 8 | 16

export const MATCH_REPLAY_SPEEDS: MatchReplaySpeed[] = [1, 2, 4, 8, 16]

/** Conventional first-half end for synthetic fixtures without a period field. */
export const HALFTIME_MINUTE = 45

export interface ScoreRacePoint {
  minute: number
  home: number
  away: number
  /** Goal event that produced this step, when applicable */
  eventId?: string
  teamId?: string
}

export interface ScoreRaceMarker {
  eventId: string
  minute: number
  teamId?: string
  kind: 'goal' | 'shot' | 'decision'
  homeScore: number
  awayScore: number
}

export interface ScoreRaceSeries {
  points: ScoreRacePoint[]
  markers: ScoreRaceMarker[]
  /** Final totals from goal events in the log */
  derivedScore: { home: number; away: number }
  maxMinute: number
}

/**
 * Highlights are a client-side filter of real events — not a broadcast package.
 * Includes goals, all shots, and Decision Explorer candidates (pass / shot / carry).
 */
export function isHighlightEvent(event: MatchEvent): boolean {
  if (event.type === 'shot') return true
  if (isDecisionCandidate(event)) return true
  return false
}

export function filterEventsForMode(
  events: readonly MatchEvent[],
  mode: ReplayMode,
): MatchEvent[] {
  if (mode === 'full') return [...events]
  return events.filter(isHighlightEvent)
}

export function matchClockMaxMinute(
  events: readonly MatchEvent[],
  match?: Pick<MatchSummary, 'minute' | 'status'> | null,
): number {
  const fromEvents = events.reduce(
    (max, event) =>
      event.minute != null && Number.isFinite(event.minute)
        ? Math.max(max, event.minute)
        : max,
    0,
  )
  const fromMatch =
    match?.minute != null && Number.isFinite(match.minute) ? match.minute : 0
  return Math.max(90, fromEvents, fromMatch, HALFTIME_MINUTE)
}

/**
 * Cumulative score race from shot events with outcome === 'goal'.
 * Does not invent xG, momentum, or possession. Step series only advances on goals.
 */
export function buildScoreRace(
  events: readonly MatchEvent[],
  homeTeamId: string,
  awayTeamId: string,
  match?: Pick<MatchSummary, 'minute' | 'status'> | null,
): ScoreRaceSeries {
  const goals = events
    .filter(
      (event): event is MatchEvent & { type: 'shot'; minute: number } =>
        event.type === 'shot' &&
        event.outcome === 'goal' &&
        event.minute != null &&
        Number.isFinite(event.minute),
    )
    .slice()
    .sort((a, b) => a.minute - b.minute || a.id.localeCompare(b.id))

  const points: ScoreRacePoint[] = [{ minute: 0, home: 0, away: 0 }]
  const markers: ScoreRaceMarker[] = []
  let home = 0
  let away = 0

  for (const goal of goals) {
    if (goal.teamId === homeTeamId) home += 1
    else if (goal.teamId === awayTeamId) away += 1
    else continue

    points.push({
      minute: goal.minute,
      home,
      away,
      eventId: goal.id,
      teamId: goal.teamId,
    })
    markers.push({
      eventId: goal.id,
      minute: goal.minute,
      teamId: goal.teamId,
      kind: 'goal',
      homeScore: home,
      awayScore: away,
    })
  }

  // Important non-goal markers for the chart (shots + decision candidates with minutes).
  for (const event of events) {
    if (event.minute == null || !Number.isFinite(event.minute)) continue
    if (markers.some((m) => m.eventId === event.id)) continue

    let kind: ScoreRaceMarker['kind'] | null = null
    if (event.type === 'shot') kind = 'shot'
    else if (isDecisionCandidate(event)) kind = 'decision'
    if (!kind) continue

    // Score at this minute = last goal totals at or before this minute.
    let h = 0
    let a = 0
    for (const point of points) {
      if (point.minute <= event.minute) {
        h = point.home
        a = point.away
      }
    }
    markers.push({
      eventId: event.id,
      minute: event.minute,
      teamId: event.teamId,
      kind,
      homeScore: h,
      awayScore: a,
    })
  }

  markers.sort(
    (a, b) => a.minute - b.minute || a.eventId.localeCompare(b.eventId),
  )

  return {
    points,
    markers,
    derivedScore: { home, away },
    maxMinute: matchClockMaxMinute(events, match),
  }
}

/** Step-line polyline points for SVG (horizontal then vertical at each change). */
export function scoreRaceStepPath(
  points: ScoreRacePoint[],
  team: 'home' | 'away',
  maxMinute: number,
  maxScore: number,
  width: number,
  height: number,
  padY = 12,
): string {
  if (points.length === 0) return ''
  const usableH = Math.max(height - padY * 2, 1)
  const yFor = (value: number) => {
    if (maxScore <= 0) return height - padY
    return height - padY - (value / maxScore) * usableH
  }
  const xFor = (minute: number) =>
    (Math.min(Math.max(minute, 0), maxMinute) / Math.max(maxMinute, 1)) * width

  const coords: string[] = []
  let prevY = yFor(points[0]?.[team] ?? 0)
  coords.push(`${xFor(points[0]?.minute ?? 0).toFixed(1)},${prevY.toFixed(1)}`)

  for (let i = 1; i < points.length; i += 1) {
    const point = points[i]!
    const x = xFor(point.minute)
    const y = yFor(point[team])
    coords.push(`${x.toFixed(1)},${prevY.toFixed(1)}`)
    coords.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    prevY = y
  }

  // Extend flat to end of clock so the step is readable after the last goal.
  const endX = xFor(maxMinute)
  coords.push(`${endX.toFixed(1)},${prevY.toFixed(1)}`)
  return coords.join(' ')
}

export function eventMinuteProgress(
  event: MatchEvent | null | undefined,
  maxMinute: number,
): number {
  if (!event || event.minute == null || !Number.isFinite(event.minute)) return 0
  if (maxMinute <= 0) return 0
  return Math.min(1, Math.max(0, event.minute / maxMinute))
}
