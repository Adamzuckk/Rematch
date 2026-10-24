import { useMemo } from 'react'
import type { MatchEvent, MatchSummary } from '../../types'
import {
  HALFTIME_MINUTE,
  buildScoreRace,
  eventMinuteProgress,
  scoreRaceStepPath,
  type ScoreRaceMarker,
} from '../../lib/matchReplay'
import { useLocale } from '../../i18n/locale'
import styles from './MatchMomentumChart.module.css'

export interface MatchMomentumChartProps {
  match: MatchSummary
  events: readonly MatchEvent[]
  selectedEventId: string | null
  /** Continuous match-minute playhead; falls back to selected event minute. */
  playheadMinute?: number | null
  onSelectEvent: (eventId: string) => void
  onOpenDecision?: (eventId: string) => void
}

function markerClass(
  marker: ScoreRaceMarker,
  homeTeamId: string,
  awayTeamId: string,
  selected: boolean,
): string {
  const side =
    marker.teamId === homeTeamId
      ? styles.markerHome
      : marker.teamId === awayTeamId
        ? styles.markerAway
        : styles.markerNeutral
  const kind = marker.kind === 'goal' ? styles.markerGoal : ''
  const sel = selected ? styles.markerSelected : ''
  return `${styles.marker} ${side} ${kind} ${sel}`.trim()
}

export function MatchMomentumChart({
  match,
  events,
  selectedEventId,
  playheadMinute = null,
  onSelectEvent,
  onOpenDecision,
}: MatchMomentumChartProps) {
  const { t } = useLocale()

  const series = useMemo(
    () => buildScoreRace(events, match.homeTeam.id, match.awayTeam.id, match),
    [events, match],
  )

  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? null
  const continuousMinute =
    playheadMinute != null && Number.isFinite(playheadMinute)
      ? playheadMinute
      : selectedEvent?.minute
  const playheadX =
    continuousMinute != null &&
    Number.isFinite(continuousMinute) &&
    series.maxMinute > 0
      ? Math.min(1, Math.max(0, continuousMinute / series.maxMinute)) * 600
      : eventMinuteProgress(selectedEvent, series.maxMinute) * 600

  const displayScore = match.score ?? series.derivedScore
  const maxScore = Math.max(
    1,
    displayScore.home,
    displayScore.away,
    ...series.points.map((p) => Math.max(p.home, p.away)),
  )

  const chartW = 600
  const chartH = 168
  const htX = (HALFTIME_MINUTE / Math.max(series.maxMinute, 1)) * chartW

  const homePath = scoreRaceStepPath(
    series.points,
    'home',
    series.maxMinute,
    maxScore,
    chartW,
    chartH,
  )
  const awayPath = scoreRaceStepPath(
    series.points,
    'away',
    series.maxMinute,
    maxScore,
    chartW,
    chartH,
  )

  const yForScore = (value: number) => {
    const padY = 12
    const usableH = chartH - padY * 2
    return chartH - padY - (value / maxScore) * usableH
  }

  return (
    <section
      className={styles.root}
      aria-labelledby="match-momentum-title"
      data-testid="match-momentum-chart"
    >
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>{t('momentumEyebrow')}</p>
          <h2 id="match-momentum-title" className={styles.title}>
            {t('momentumTitle')}
          </h2>
          <p className={styles.hint}>{t('momentumHint')}</p>
        </div>
        <p
          className={styles.score}
          aria-label={t('momentumScoreLabel')
            .replace('{home}', String(displayScore.home))
            .replace('{away}', String(displayScore.away))}
        >
          <span>{displayScore.home}</span>
          <span className={styles.scoreSep} aria-hidden="true">
            –
          </span>
          <span>{displayScore.away}</span>
        </p>
      </header>

      {series.points.length <= 1 && series.markers.length === 0 ? (
        <p className={styles.empty} role="status">
          {t('momentumEmpty')}
        </p>
      ) : (
        <>
          <div className={styles.chartWrap}>
            <svg
              className={styles.chart}
              viewBox={`0 0 ${chartW} ${chartH}`}
              role="img"
              aria-label={t('momentumTitle')}
            >
              {[0.25, 0.5, 0.75].map((frac) => {
                const y = yForScore(maxScore * frac)
                return (
                  <line
                    key={frac}
                    x1={0}
                    y1={y}
                    x2={chartW}
                    y2={y}
                    className={styles.grid}
                  />
                )
              })}
              <line
                x1={0}
                y1={chartH - 12}
                x2={chartW}
                y2={chartH - 12}
                className={styles.axis}
              />
              <line
                x1={htX}
                y1={8}
                x2={htX}
                y2={chartH - 12}
                className={styles.htLine}
              />
              <text
                x={htX + 4}
                y={18}
                className={styles.htLabel}
                data-testid="momentum-ht-label"
              >
                {t('momentumHalftime')}
              </text>
              {homePath ? (
                <polyline
                  points={homePath}
                  className={styles.homeLine}
                  fill="none"
                  data-testid="momentum-home-line"
                />
              ) : null}
              {awayPath ? (
                <polyline
                  points={awayPath}
                  className={styles.awayLine}
                  fill="none"
                  data-testid="momentum-away-line"
                />
              ) : null}
              {selectedEvent ? (
                <line
                  x1={playheadX}
                  y1={8}
                  x2={playheadX}
                  y2={chartH - 12}
                  className={styles.playhead}
                  data-testid="momentum-playhead"
                />
              ) : null}
              {series.markers.map((marker) => {
                const x =
                  (marker.minute / Math.max(series.maxMinute, 1)) * chartW
                const scoreForY =
                  marker.teamId === match.homeTeam.id
                    ? marker.homeScore
                    : marker.teamId === match.awayTeam.id
                      ? marker.awayScore
                      : Math.max(marker.homeScore, marker.awayScore)
                const y = yForScore(scoreForY)
                const selected = marker.eventId === selectedEventId
                const label = `${marker.kind} ${marker.minute}'`
                return (
                  <g
                    key={marker.eventId}
                    className={markerClass(
                      marker,
                      match.homeTeam.id,
                      match.awayTeam.id,
                      selected,
                    )}
                    transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    aria-pressed={selected}
                    data-testid={`momentum-marker-${marker.eventId}`}
                    data-kind={marker.kind}
                    onClick={() => onSelectEvent(marker.eventId)}
                    onDoubleClick={() => {
                      if (marker.kind === 'decision' || marker.kind === 'goal') {
                        onOpenDecision?.(marker.eventId)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelectEvent(marker.eventId)
                      }
                      if (e.key === 'Enter' && e.shiftKey) {
                        onOpenDecision?.(marker.eventId)
                      }
                    }}
                  >
                    <circle
                      className={styles.markerCircle}
                      r={marker.kind === 'goal' ? 5.5 : 4}
                    />
                  </g>
                )
              })}
            </svg>
          </div>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <i className={styles.swatchHome} aria-hidden="true" />
              {match.homeTeam.name}
            </span>
            <span className={styles.legendItem}>
              <i className={styles.swatchAway} aria-hidden="true" />
              {match.awayTeam.name}
            </span>
          </div>
        </>
      )}
    </section>
  )
}
