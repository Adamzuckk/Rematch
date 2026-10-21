import { useEffect, useState } from 'react'
import { useLocale } from '../i18n/locale'
import { matchService } from '../services/matches'
import type { DashboardOverviewStat } from '../types'
import styles from './MetricsPage.module.css'

export function MetricsPage() {
  const { t } = useLocale()
  const [stats, setStats] = useState<DashboardOverviewStat[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    matchService
      .getOverviewStats()
      .then((rows) => {
        if (!cancelled) setStats(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load metrics')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>{t('statusSynthetic')}</p>
        <h1>{t('metricsTitle')}</h1>
        <p className={styles.lead}>{t('metricsLiveDescription')}</p>
      </header>
      {error ? <p className={styles.error}>{error}</p> : null}
      {!error && !stats ? <p className={styles.muted}>{t('metricsLoading')}</p> : null}
      {stats && stats.length === 0 ? <p className={styles.muted}>{t('metricsEmpty')}</p> : null}
      {stats && stats.length > 0 ? (
        <div className={styles.grid}>
          {stats.map((stat) => (
            <article key={stat.id} className={styles.card}>
              <h2>{stat.label}</h2>
              <p className={styles.value}>{stat.value}</p>
              {stat.hint ? <p className={styles.hint}>{stat.hint}</p> : null}
            </article>
          ))}
        </div>
      ) : null}
      <section className={styles.note}>
        <h2>{t('metricsScopeHeading')}</h2>
        <ul>
          <li>{t('metricsScope1')}</li>
          <li>{t('metricsScope2')}</li>
          <li>{t('metricsScope3')}</li>
        </ul>
      </section>
    </div>
  )
}
