import type { MatchEvent, MatchSummary } from '../../types'
import {
  HALFTIME_MINUTE,
  MATCH_REPLAY_SPEEDS,
  eventMinuteProgress,
  matchClockMaxMinute,
  type MatchReplaySpeed,
  type ReplayMode,
} from '../../lib/matchReplay'
import { useLocale } from '../../i18n/locale'
import styles from './MatchReplayTimeline.module.css'

export type { MatchReplaySpeed, ReplayMode }

export interface MatchReplayTimelineProps {
  match: MatchSummary
  /** Events visible in the current mode (already filtered). */
  events: readonly MatchEvent[]
  selectedEventId: string | null
  /** Continuous match-minute playhead; falls back to selected event minute. */
  playheadMinute?: number | null
  playing: boolean
  speed: MatchReplaySpeed
  mode: ReplayMode
  onTogglePlay: () => void
  onSpeed: (speed: MatchReplaySpeed) => void
  onMode: (mode: ReplayMode) => void
  onSelectEvent: (eventId: string) => void
  onOpenDecision?: (eventId: string) => void
  onSeekIndex: (index: number) => void
}

function sideClass(
  event: MatchEvent,
  homeTeamId: string,
  awayTeamId: string,
): string {
  if (event.teamId === homeTeamId) return styles.markerHome ?? ''
  if (event.teamId === awayTeamId) return styles.markerAway ?? ''
  return ''
}

export function MatchReplayTimeline({
  match,
  events,
  selectedEventId,
  playheadMinute = null,
  playing,
  speed,
  mode,
  onTogglePlay,
  onSpeed,
  onMode,
  onSelectEvent,
  onOpenDecision,
  onSeekIndex,
}: MatchReplayTimelineProps) {
  const { t } = useLocale()
  const maxMinute = matchClockMaxMinute(events, match)
  const selectedIndex = events.findIndex((e) => e.id === selectedEventId)
  const selectedEvent =
    selectedIndex >= 0 ? (events[selectedIndex] ?? null) : null
  const continuousMinute =
    playheadMinute != null && Number.isFinite(playheadMinute)
      ? playheadMinute
      : selectedEvent?.minute
  const playheadPct =
    continuousMinute != null && Number.isFinite(continuousMinute) && maxMinute > 0
      ? Math.min(1, Math.max(0, continuousMinute / maxMinute)) * 100
      : eventMinuteProgress(selectedEvent, maxMinute) * 100
  const htPct = (HALFTIME_MINUTE / Math.max(maxMinute, 1)) * 100
  const tickMinutes = [0, 15, 30, 45, 60, 75, Math.round(maxMinute)].filter(
    (value, index, all) => all.indexOf(value) === index && value <= maxMinute,
  )

  return (
    <section
      className={styles.root}
      aria-label={t('replayLabel')}
      data-testid="match-replay-timeline"
    >
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.play}
          onClick={onTogglePlay}
          disabled={events.length === 0}
          aria-pressed={playing}
        >
          {playing ? t('replayPause') : t('replayPlay')}
        </button>

        <div
          className={styles.modes}
          role="group"
          aria-label={t('replayModeLabel')}
        >
          <button
            type="button"
            className={mode === 'full' ? styles.modeActive : styles.mode}
            aria-pressed={mode === 'full'}
            onClick={() => onMode('full')}
          >
            {t('replayModeFull')}
          </button>
          <button
            type="button"
            className={mode === 'highlights' ? styles.modeActive : styles.mode}
            aria-pressed={mode === 'highlights'}
            onClick={() => onMode('highlights')}
            title={t('replayModeHighlightsHint')}
          >
            {t('replayModeHighlights')}
          </button>
        </div>

        <span className={styles.pos} data-testid="replay-position">
          {events.length === 0
            ? '0/0'
            : `${Math.max(selectedIndex, 0) + 1}/${events.length}`}
        </span>

        <div
          className={styles.speeds}
          role="group"
          aria-label={t('replaySpeedLabel')}
        >
          {MATCH_REPLAY_SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              className={value === speed ? styles.speedActive : styles.speed}
              aria-pressed={value === speed}
              onClick={() => onSpeed(value)}
            >
              {value}x
            </button>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <p className={styles.empty} role="status">
          {t('replayTimelineEmpty')}
        </p>
      ) : (
        <>
          <div className={styles.timeline} data-testid="replay-timeline-track">
            <div className={styles.track} aria-hidden="true" />
            <div
              className={styles.htMark}
              style={{ left: `${htPct}%` }}
              data-testid="replay-ht-marker"
            >
              <span className={styles.htLine} />
              <span className={styles.htLabel}>{t('momentumHalftime')}</span>
            </div>
            <div
              className={styles.playhead}
              style={{ left: `${playheadPct}%` }}
              data-testid="replay-playhead"
            >
              <span className={styles.playheadHead} />
            </div>
            {events.map((event, index) => {
              if (event.minute == null || !Number.isFinite(event.minute)) {
                return null
              }
              const left =
                (event.minute / Math.max(maxMinute, 1)) * 100
              const selected = event.id === selectedEventId
              const isGoal =
                event.type === 'shot' && event.outcome === 'goal'
              const label = `${event.type} ${event.minute}'`
              return (
                <button
                  key={event.id}
                  type="button"
                  className={[
                    styles.marker,
                    sideClass(event, match.homeTeam.id, match.awayTeam.id),
                    isGoal ? styles.markerGoal : '',
                    selected ? styles.markerSelected : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ left: `${left}%` }}
                  aria-label={label}
                  aria-pressed={selected}
                  data-testid={`replay-marker-${event.id}`}
                  onClick={() => {
                    onSelectEvent(event.id)
                    onSeekIndex(index)
                  }}
                  onDoubleClick={() => onOpenDecision?.(event.id)}
                />
              )
            })}
            <div className={styles.ticks} aria-hidden="true">
              {tickMinutes.map((minute) => (
                <span key={minute}>{minute}'</span>
              ))}
            </div>
          </div>
          <p className={styles.hint}>
            {mode === 'highlights'
              ? t('replayModeHighlightsHint')
              : t('replayTimelineHint')}
          </p>
        </>
      )}
    </section>
  )
}
