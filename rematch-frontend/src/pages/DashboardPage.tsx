import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { MatchCard } from '../components/MatchCard'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { StatCard } from '../components/ui/StatCard'
import { useLocale } from '../i18n/locale'
import type { MessageKey } from '../i18n/strings'
import { matchService } from '../services/matches'
import type {
  DashboardOverviewStat,
  MatchDatasetInfo,
  MatchStatusFilter,
  MatchSummary,
} from '../types'
import styles from './DashboardPage.module.css'

const FILTERS: { id: MatchStatusFilter; labelKey: MessageKey }[] = [
  { id: 'all', labelKey: 'filterAll' },
  { id: 'live', labelKey: 'filterLive' },
  { id: 'finished', labelKey: 'filterFinished' },
  { id: 'upcoming', labelKey: 'filterUpcoming' },
]

type ReadyPayload = {
  requestKey: string
  matches: MatchSummary[]
  totalCount: number
  overview: DashboardOverviewStat[]
  dataset: MatchDatasetInfo
}

export function DashboardPage() {
  const { t } = useLocale()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<MatchStatusFilter>('all')
  const [reloadToken, setReloadToken] = useState(0)
  const [ready, setReady] = useState<ReadyPayload | null>(null)
  const [error, setError] = useState<{ requestKey: string; message: string } | null>(
    null,
  )

  const requestKey = `${query}::${statusFilter}::${reloadToken}`

  const retry = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const [matches, allMatches, overview, dataset] = await Promise.all([
          matchService.getMatches({ query, status: statusFilter }),
          matchService.getMatches(),
          matchService.getOverviewStats(),
          matchService.getDatasetInfo(),
        ])
        if (cancelled) return
        setReady({
          requestKey,
          matches,
          totalCount: allMatches.length,
          overview,
          dataset,
        })
        setError(null)
      } catch (cause: unknown) {
        if (cancelled) return
        const message =
          cause instanceof Error ? cause.message : 'Unknown match service error'
        setError({ requestKey, message })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [query, statusFilter, reloadToken, requestKey])

  const hasActiveFilters = query.trim().length > 0 || statusFilter !== 'all'
  const isReady = ready?.requestKey === requestKey
  const isError = error?.requestKey === requestKey
  const isLoading = !isReady && !isError

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{t('dashboardEyebrow')}</p>
          <h1 className={styles.title}>{t('dashboardTitle')}</h1>
          <p className={styles.intro}>{t('dashboardIntro')}</p>
          {isReady ? (
            <p className={styles.seed}>
              {t('dashboardSeed')}: {ready.dataset.scenarioId} ·{' '}
              {t('dashboardProvenance')}: {ready.dataset.provenance}
            </p>
          ) : null}
          {isReady ? (
            <div className={styles.heroReadout} aria-label={t('dashboardCatalogueReadout')}>
              <span className={styles.readoutValue}>{ready.totalCount}</span>
              <span className={styles.readoutLabel}>{t('dashboardCatalogueReadout')}</span>
              <span className={styles.readoutRule} aria-hidden="true" />
              <span className={styles.readoutLabel}>{t('dashboardEvidenceFirst')}</span>
            </div>
          ) : null}
        </div>
        <div className={styles.tacticalWindow} aria-hidden="true">
          <span className={styles.tacticalHalfway} />
          <span className={styles.tacticalCircle} />
          <span className={styles.tacticalBoxTop} />
          <span className={styles.tacticalBoxBottom} />
          <span className={styles.tacticalBall} />
          <span className={[styles.runner, styles.runnerOne].join(' ')} />
          <span className={[styles.runner, styles.runnerTwo].join(' ')} />
          <span className={[styles.runner, styles.runnerThree].join(' ')} />
        </div>
      </header>

      {isReady ? (
        <section aria-label={t('overviewLabel')}>
          <div className={styles.stats}>
            {ready.overview.map((stat) => (
              <StatCard
                key={stat.id}
                label={stat.label}
                value={stat.value}
                hint={stat.hint}
                isDemoValue={stat.isDemoValue}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.toolbar} aria-label={t('matchesHeading')}>
        <div className={styles.toolbarHeader}>
          <div>
            <h2 className={styles.sectionTitle}>{t('matchesHeading')}</h2>
            <p className={styles.sectionHint}>{t('matchesHint')}</p>
          </div>
          {isReady ? (
            <p className={styles.resultsMeta} aria-live="polite">
              {t('showingResults')} {ready.matches.length}{' '}
              {t('ofResults')} {ready.totalCount}
            </p>
          ) : null}
        </div>

        <div className={styles.controls}>
          <div className={styles.search}>
            <Search className={styles.searchIcon} size={16} aria-hidden="true" />
            <label className="sr-only" htmlFor="match-search">
              {t('searchLabel')}
            </label>
            <input
              id="match-search"
              className={styles.searchInput}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              autoComplete="off"
            />
          </div>

          <div
            className={styles.filters}
            role="group"
            aria-label={t('filterByStatus')}
          >
            {FILTERS.map((filter) => {
              const active = statusFilter === filter.id
              return (
                <Button
                  key={filter.id}
                  variant={active ? 'primary' : 'secondary'}
                  className={styles.filterButton}
                  onClick={() => setStatusFilter(filter.id)}
                  aria-pressed={active}
                >
                  {t(filter.labelKey)}
                </Button>
              )
            })}
          </div>
        </div>

        {isLoading ? (
          <div className={styles.loading} role="status" aria-live="polite">
            <span className={styles.loadingBall} aria-hidden="true" />
            <span>{t('loadingMatches')}</span>
          </div>
        ) : null}

        {isError ? (
          <EmptyState
            title={t('loadErrorTitle')}
            description={error.message}
            action={
              <Button variant="secondary" onClick={retry}>
                {t('loadErrorRetry')}
              </Button>
            }
          />
        ) : null}

        {isReady && ready.matches.length === 0 ? (
          <EmptyState
            title={t('emptyTitle')}
            description={
              hasActiveFilters ? t('emptyFiltered') : t('emptyCatalogue')
            }
            action={
              hasActiveFilters ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('')
                    setStatusFilter('all')
                  }}
                >
                  {t('clearFilters')}
                </Button>
              ) : undefined
            }
          />
        ) : null}

        {isReady && ready.matches.length > 0 ? (
          <div className={styles.grid}>
            {ready.matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
