import { useCallback, useEffect, useState } from 'react'
import { Activity, Database, RotateCw, ShieldCheck } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { useLocale } from '../i18n/locale'
import { matchService } from '../services/matches'
import type { MetricsOperation, MetricsRange, SystemMetrics } from '../types'
import styles from './MetricsPage.module.css'

const rangeKeys: Record<MetricsRange, 'metricsRange24h' | 'metricsRange7d' | 'metricsRange30d' | 'metricsRangeAll'> = {
  '24h': 'metricsRange24h', '7d': 'metricsRange7d', '30d': 'metricsRange30d', all: 'metricsRangeAll',
}
const operationKeys: Record<MetricsOperation, 'metricsOperationAll' | 'metricsOperationAnalysis' | 'metricsOperationVerification'> = {
  all: 'metricsOperationAll', analysis: 'metricsOperationAnalysis', verification: 'metricsOperationVerification',
}

function number(value: number, locale: string) { return new Intl.NumberFormat(locale).format(value) }
function percent(value: number | null, locale: string) { return value === null ? '—' : `${number(value, locale)}%` }
function latency(value: number | null, locale: string) { return value === null ? '—' : `${number(value, locale)} ms` }

const catalogueSourceKeys = {
  synthetic: 'metricsCatalogueSourceSynthetic', api: 'metricsCatalogueSourceApi',
  mixed: 'metricsCatalogueSourceMixed', unavailable: 'metricsCatalogueSourceUnavailable',
} as const

export function MetricsPage() {
  const { t, locale } = useLocale()
  const [range, setRange] = useState<MetricsRange>('7d')
  const [operation, setOperation] = useState<MetricsOperation>('all')
  const [metrics, setMetrics] = useState<SystemMetrics | null | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    matchService.getSystemMetrics({ range, operation }).then((response) => {
      if (!cancelled) {
        setError(null)
        setMetrics(response)
      }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : t('metricsLoadError'))
    })
    return () => { cancelled = true }
  }, [operation, range, reload, t])

  const refresh = useCallback(() => {
    setError(null)
    setMetrics(undefined)
    setReload((value) => value + 1)
  }, [])

  const changeRange = (value: MetricsRange) => {
    setError(null)
    setMetrics(undefined)
    setRange(value)
  }

  const changeOperation = (value: MetricsOperation) => {
    setError(null)
    setMetrics(undefined)
    setOperation(value)
  }
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{t('metricsOperationalEyebrow')}</p>
        <h1>{t('metricsTitle')}</h1>
        <p className={styles.lead}>{t('metricsOperationalDescription')}</p>
      </header>
      <section className={styles.toolbar} aria-label={t('metricsTitle')}>
        <label><span>{t('metricsRangeLabel')}</span><select value={range} onChange={(event) => changeRange(event.target.value as MetricsRange)}>{(Object.keys(rangeKeys) as MetricsRange[]).map((value) => <option key={value} value={value}>{t(rangeKeys[value])}</option>)}</select></label>
        <label><span>{t('metricsOperationLabel')}</span><select value={operation} onChange={(event) => changeOperation(event.target.value as MetricsOperation)}>{(Object.keys(operationKeys) as MetricsOperation[]).map((value) => <option key={value} value={value}>{t(operationKeys[value])}</option>)}</select></label>
        <Button className={styles.refresh} onClick={refresh} disabled={metrics === undefined}><RotateCw size={15} aria-hidden="true" />{t('metricsRefresh')}</Button>
      </section>
      {metrics === undefined && !error ? <p className={styles.loading} role="status">{t('metricsLoading')}</p> : null}
      {error ? <EmptyState title={t('metricsLoadError')} description={error} action={<Button onClick={refresh}>{t('metricsRetry')}</Button>} /> : null}
      {metrics === null && !error ? <EmptyState title={t('metricsMockTitle')} description={t('metricsMockBody')} icon={<Database size={28} />} /> : null}
      {metrics && !error ? <MetricsDashboard metrics={metrics} locale={locale} /> : null}
    </div>
  )
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return <article className={`${styles.card} ${tone ? styles[tone] : ''}`}><p>{label}</p><strong>{value}</strong></article>
}

function MetricsDashboard({ metrics, locale }: { metrics: SystemMetrics; locale: string }) {
  const { t } = useLocale()
  const hasRuns = metrics.operations.attempts > 0
  const coverage = metrics.catalogueCoverage
  return (
    <div className={styles.dashboard}>
      <section className={styles.source} aria-label={t('metricsSourceHeading')}>
        <div><p className={styles.sourceLabel}>{t('metricsSourceHeading')}</p><p>{t('metricsTelemetrySource')}</p></div>
        <time dateTime={metrics.generatedAt}>{t('metricsUpdated')}: {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(metrics.generatedAt))}</time>
      </section>
      <section aria-labelledby="recorded-operations">
        <div className={styles.sectionHeading}><Activity size={18} aria-hidden="true" /><h2 id="recorded-operations">{t('metricsRunsHeading')}</h2></div>
        {hasRuns ? <div className={styles.grid}>
          <MetricCard label={t('metricsAttempts')} value={number(metrics.operations.attempts, locale)} />
          <MetricCard label={t('metricsSucceeded')} value={number(metrics.operations.succeeded, locale)} tone="good" />
          <MetricCard label={t('metricsFailed')} value={number(metrics.operations.failed, locale)} tone={metrics.operations.failed ? 'bad' : undefined} />
          <MetricCard label={t('metricsSuccessRate')} value={percent(metrics.operations.successRatePercent, locale)} />
          <MetricCard label={t('metricsAverageLatency')} value={latency(metrics.operations.averageLatencyMs, locale)} />
          <MetricCard label={t('metricsP95Latency')} value={latency(metrics.operations.p95LatencyMs, locale)} />
        </div> : <EmptyState title={t('metricsNoRunsTitle')} description={t('metricsNoRunsBody')} icon={<Activity size={28} />} />}
      </section>
      <section className={styles.twoColumn}>
        <div className={styles.panel}>
          <div className={styles.sectionHeading}><ShieldCheck size={18} aria-hidden="true" /><h2>{t('metricsVerificationHeading')}</h2></div>
          {metrics.verification.checked ? <div className={styles.compactGrid}>
            <MetricCard label={t('metricsClaimsChecked')} value={number(metrics.verification.checked, locale)} />
            <MetricCard label={t('metricsClaimsVerified')} value={number(metrics.verification.verified, locale)} tone="good" />
            <MetricCard label={t('metricsClaimsPartial')} value={number(metrics.verification.partiallySupported, locale)} />
            <MetricCard label={t('metricsClaimsUnsupported')} value={number(metrics.verification.unsupported, locale)} tone={metrics.verification.unsupported ? 'bad' : undefined} />
          </div> : <p className={styles.muted}>{t('metricsNoVerification')}</p>}
        </div>
        <div className={styles.panel}>
          <div className={styles.sectionHeading}><Database size={18} aria-hidden="true" /><h2>{t('metricsFallbackHeading')}</h2></div>
          <p className={styles.unavailable}>{t('metricsUnavailable')}</p><p className={styles.muted}>{metrics.fallbackUsage.reason}</p>
        </div>
      </section>
      <section className={styles.coverage} aria-labelledby="catalogue-coverage">
        <div><div className={styles.sectionHeading}><Database size={18} aria-hidden="true" /><h2 id="catalogue-coverage">{t('metricsCatalogueHeading')}</h2></div><p className={styles.muted}>{t('metricsCatalogueDescription')}</p><p className={styles.sourceLabel}>{t(catalogueSourceKeys[coverage.provenance])}</p></div>
        <div className={styles.coverageValue}><span>{t('metricsEligibleEvents')}</span><strong>{number(coverage.eligibleEvents, locale)} / {number(coverage.totalEvents, locale)}</strong><b>{percent(coverage.coveragePercent, locale)} {t('metricsCatalogueCoverage')}</b></div>
      </section>
    </div>
  )
}
