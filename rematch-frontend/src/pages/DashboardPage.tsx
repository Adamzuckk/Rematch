import { useCallback, useEffect, useMemo, useState } from 'react'
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
  MatchStatus,
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

const BOARD_ORDER: MatchStatus[] = ['live', 'finished', 'upcoming']

const BOARD_COPY: Record<MatchStatus, { titleKey: MessageKey; hintKey: MessageKey }> = {
  live: { titleKey: 'boardLiveTitle', hintKey: 'boardLiveHint' },
  finished: { titleKey: 'boardFinishedTitle', hintKey: 'boardFinishedHint' },
  upcoming: { titleKey: 'boardUpcomingTitle', hintKey: 'boardUpcomingHint' },
}

type StatusCounts = Record<MatchStatusFilter, number>

type ReadyPayload = {
  requestKey: string
  matches: MatchSummary[]
  totalCount: number
  statusCounts: StatusCounts
  overview: DashboardOverviewStat[]
  dataset: MatchDatasetInfo
}

function countByStatus(matches: MatchSummary[]): StatusCounts {
  return {
    all: matches.length,
    live: matches.filter((match) => match.status === 'live').length,
    finished: matches.filter((match) => match.status === 'finished').length,
    upcoming: matches.filter((match) => match.status === 'upcoming').length,
  }
}

function groupByStatus(matches: MatchSummary[]): Record<MatchStatus, MatchSummary[]> {
  return {
    live: matches.filter((match) => match.status === 'live'),
    finished: matches.filter((match) => match.status === 'finished'),
    upcoming: matches.filter((match) => match.status === 'upcoming'),
  }
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
    let pollTimer: ReturnType<typeof setInterval> | undefined

    const load = async (options?: { soft?: boolean }) => {
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
          statusCounts: countByStatus(allMatches),
          overview,
          dataset,
        })
        setError(null)

        const hasLive = allMatches.some((match) => match.status === 'live')
        if (hasLive && pollTimer == null) {
          pollTimer = setInterval(() => {
            void load({ soft: true })
          }, 5_000)
        }
        if (!hasLive && pollTimer != null) {
          clearInterval(pollTimer)
          pollTimer = undefined
        }
      } catch (cause: unknown) {
        if (cancelled || options?.soft) return
        const message =
          cause instanceof Error ? cause.message : 'Unknown match service error'
        setError({ requestKey, message })
      }
    }

    void load()

    return () => {
      cancelled = true
      if (pollTimer != null) clearInterval(pollTimer)
    }
  }, [query, statusFilter, reloadToken, requestKey])

  const hasActiveFilters = query.trim().length > 0 || statusFilter !== 'all'
  const isReady = ready?.requestKey === requestKey
  const isError = error?.requestKey === requestKey
  const isLoading = !isReady && !isError

  const grouped = useMemo(
    () => (isReady ? groupByStatus(ready.matches) : null),
    [isReady, ready],
  )

  const handleMatchUpdated = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  function renderBoard(status: MatchStatus, matches: MatchSummary[]) {
    if (matches.length === 0) return null
    const copy = BOARD_COPY[status]
    return (
      <section key={status} className={styles.board} data-board={status}>
        <div className={styles.boardHeader}>
          <div className={styles.boardHeading}>
            <h3 className={styles.boardTitle}>{t(copy.titleKey)}</h3>
            <p className={styles.boardHint}>{t(copy.hintKey)}</p>
          </div>
          <span className={styles.boardCount} aria-hidden="true">
            {String(matches.length).padStart(2, '0')}
          </span>
        </div>
        <div className={status === 'live' ? styles.liveRail : styles.grid}>
          {matches.map((match, index) => (
            <MatchCard
              key={match.id}
              match={match}
              featured={status === 'live' && index === 0}
              onMatchUpdated={handleMatchUpdated}
            />
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowMark} aria-hidden="true" />
            {t('dashboardEyebrow')}
          </p>
          <h1 className={styles.title}>
            {t('dashboardTitle')}{' '}
            <span className={styles.titleAccent}>{t('dashboardTitleAccent')}</span>
          </h1>
          <p className={styles.intro}>{t('dashboardIntro')}</p>
          {isReady ? (
            <p className={styles.seed}>
              {t('dashboardSeed')}: {ready.dataset.scenarioId} ·{' '}
              {t('dashboardProvenance')}: {ready.dataset.provenance}
            </p>
          ) : null}
        </div>

        <div className={styles.heroAside}>
          {isReady ? (
            <div className={styles.heroReadout} aria-label={t('dashboardCatalogueReadout')}>
              <span className={styles.readoutValue}>{ready.totalCount}</span>
              <div className={styles.readoutCopy}>
                <span className={styles.readoutLabel}>{t('dashboardCatalogueReadout')}</span>
                <span className={styles.readoutSub}>{t('dashboardEvidenceFirst')}</span>
              </div>
            </div>
          ) : (
            <div className={styles.heroReadoutGhost} aria-hidden="true" />
          )}
          <div className={styles.pitchMark} aria-hidden="true">
            <span className={styles.pitchArc} />
            <span className={styles.pitchLine} />
            <span className={styles.pitchDot} />
            <span className={styles.pitchRunner} />
          </div>
        </div>
      </header>

      {isReady ? (
        <section className={styles.pulse} aria-label={t('overviewLabel')}>
          <div className={styles.pulseRail}>
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

      <section className={styles.desk} aria-label={t('matchesHeading')}>
        <div className={styles.deskHeader}>
          <div>
            <h2 className={styles.sectionTitle}>
              {t('matchesHeading')}
              <span className={styles.sectionTitleAccent}> / {t('dashboardTitleAccent')}</span>
            </h2>
            <p className={styles.sectionHint}>{t('matchesHint')}</p>
          </div>
          {isReady ? (
            <p className={styles.resultsMeta} aria-live="polite">
              {t('showingResults')} {ready.matches.length} {t('ofResults')} {ready.totalCount}
            </p>
          ) : null}
        </div>

        <div className={styles.controlBar}>
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
              const count = isReady ? ready.statusCounts[filter.id] : null
              return (
                <Button
                  key={filter.id}
                  variant={active ? 'primary' : 'secondary'}
                  className={[
                    styles.filterButton,
                    filter.id === 'live' ? styles.filterLive : '',
                    active ? styles.filterActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setStatusFilter(filter.id)}
                  aria-pressed={active}
                >
                  <span>{t(filter.labelKey)}</span>
                  {count != null ? (
                    <span className={styles.filterCount} aria-hidden="true">
                      {count}
                    </span>
                  ) : null}
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

        {isReady && ready.matches.length > 0 && grouped ? (
          <div className={styles.boards}>
            {statusFilter === 'all'
              ? BOARD_ORDER.map((status) => renderBoard(status, grouped[status]))
              : renderBoard(statusFilter as MatchStatus, ready.matches)}
          </div>
        ) : null}
      </section>
    </div>
  )
}
