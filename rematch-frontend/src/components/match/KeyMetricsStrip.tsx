import { useMemo } from 'react'
import type { MatchEvent, MatchSummary } from '../../types'
import {
  buildKeyMatchMetrics,
  type KeyMatchMetric,
} from '../../lib/matchHighlights'
import { useLocale } from '../../i18n/locale'
import type { MessageKey } from '../../i18n/strings'
import styles from './KeyMetricsStrip.module.css'

const METRIC_LABEL: Record<KeyMatchMetric['key'], MessageKey> = {
  goals: 'matchKeyMetricGoals',
  shots: 'matchKeyMetricShots',
  passes: 'matchKeyMetricPasses',
  tackles: 'matchKeyMetricTackles',
}

export interface KeyMetricsStripProps {
  match: MatchSummary
  events: readonly MatchEvent[]
}

export function KeyMetricsStrip({ match, events }: KeyMetricsStripProps) {
  const { t } = useLocale()
  const metrics = useMemo(
    () => buildKeyMatchMetrics(events, match.homeTeam.id, match.awayTeam.id),
    [events, match.homeTeam.id, match.awayTeam.id],
  )

  if (events.length === 0) {
    return null
  }

  return (
    <section
      className={styles.root}
      aria-label={t('matchKeyMetricsLabel')}
      data-testid="match-key-metrics"
    >
      <div className={styles.head}>
        <h2 className={styles.title}>{t('matchKeyMetricsLabel')}</h2>
        <p className={styles.provenance}>{t('matchDataCalculated')}</p>
      </div>
      <ul className={styles.grid} role="list">
        {metrics.map((metric) => (
          <li key={metric.key} className={styles.card}>
            <span className={styles.label}>{t(METRIC_LABEL[metric.key])}</span>
            <span className={styles.values} aria-label={`${metric.home}–${metric.away}`}>
              <span className={styles.home}>{metric.home}</span>
              <span className={styles.sep} aria-hidden="true">
                –
              </span>
              <span className={styles.away}>{metric.away}</span>
            </span>
            <span className={styles.teams}>
              <span>{match.homeTeam.shortName ?? match.homeTeam.name}</span>
              <span>{match.awayTeam.shortName ?? match.awayTeam.name}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
