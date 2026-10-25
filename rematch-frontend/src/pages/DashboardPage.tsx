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
        <div className={styles.heroStage} aria-hidden="true">
          <div className={styles.heroVoid} />
          <div className={styles.heroGrid} />
          <div className={styles.heroScan} />
          <div className={styles.heroBloom} />
          <div className={styles.heroSlice} />
          <svg className={styles.decisionGraph} viewBox="0 0 640 420" fill="none">
            <defs>
              <linearGradient id="dashPathObserved" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#82d45c" stopOpacity="0.15" />
                <stop offset="55%" stopColor="#6bbd45" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#82d45c" stopOpacity="0.35" />
              </linearGradient>
              <linearGradient id="dashPathAlt" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#4eb3d8" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#4eb3d8" stopOpacity="0.75" />
              </linearGradient>
              <linearGradient id="dashPathHot" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#f0b429" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#f0b429" stopOpacity="0.85" />
              </linearGradient>
              <filter id="dashGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* Pitch frame */}
            <rect
              x="48"
              y="36"
              width="544"
              height="348"
              rx="18"
              stroke="rgba(241,244,237,0.14)"
              strokeWidth="1.5"
            />
            <line
              x1="320"
              y1="36"
              x2="320"
              y2="384"
              stroke="rgba(241,244,237,0.1)"
              strokeWidth="1"
            />
            <circle
              cx="320"
              cy="210"
              r="54"
              stroke="rgba(241,244,237,0.12)"
              strokeWidth="1"
            />
            <circle cx="320" cy="210" r="3" fill="rgba(241,244,237,0.35)" />

            {/* Alternative lanes */}
            <path
              className={styles.pathAlt}
              d="M168 248 C 240 210, 300 148, 392 118"
              stroke="url(#dashPathAlt)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="6 10"
            />
            <path
              className={styles.pathHot}
              d="M168 248 C 250 268, 330 292, 424 306"
              stroke="url(#dashPathHot)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="5 9"
            />
            <path
              className={styles.pathObserved}
              d="M168 248 C 250 236, 340 214, 448 188"
              stroke="url(#dashPathObserved)"
              strokeWidth="3.5"
              strokeLinecap="round"
              filter="url(#dashGlow)"
            />

            {/* Carrier */}
            <circle
              className={styles.carrierRing}
              cx="168"
              cy="248"
              r="22"
              stroke="rgba(107,189,69,0.45)"
              strokeWidth="1.5"
            />
            <circle cx="168" cy="248" r="9" fill="#6bbd45" filter="url(#dashGlow)" />
            <circle className={styles.ballPulse} cx="168" cy="248" r="3.5" fill="#f1f4ed" />

            {/* Option nodes */}
            <g className={styles.nodeAlt}>
              <circle cx="392" cy="118" r="11" fill="#0a0e0c" stroke="#4eb3d8" strokeWidth="2" />
              <text x="412" y="114" className={styles.graphLabel}>
                +2.4
              </text>
              <text x="412" y="130" className={styles.graphMeta}>
                ALT · 01
              </text>
            </g>
            <g className={styles.nodeHot}>
              <circle cx="424" cy="306" r="11" fill="#0a0e0c" stroke="#f0b429" strokeWidth="2" />
              <text x="444" y="302" className={styles.graphLabel}>
                +1.1
              </text>
              <text x="444" y="318" className={styles.graphMeta}>
                ALT · 02
              </text>
            </g>
            <g className={styles.nodeObserved}>
              <circle cx="448" cy="188" r="13" fill="#6bbd45" />
              <circle cx="448" cy="188" r="4" fill="#071008" />
              <text x="470" y="184" className={styles.graphLabelHot}>
                OBS
              </text>
              <text x="470" y="200" className={styles.graphMeta}>
                14.1 · R3
              </text>
            </g>

            {/* AI scan reticule */}
            <g className={styles.reticule}>
              <circle
                cx="320"
                cy="210"
                r="118"
                stroke="rgba(107,189,69,0.18)"
                strokeWidth="1"
                strokeDasharray="3 14"
              />
              <path
                d="M320 78 L328 94 L312 94 Z"
                fill="rgba(107,189,69,0.55)"
              />
            </g>
          </svg>
        </div>

        <div className={styles.heroContent}>
          <div className={styles.heroCopy}>
            <p className={styles.brandLockup}>
              <span className={styles.brandMark} />
              <span className={styles.brandName}>{t('appName')}</span>
              <span className={styles.brandSlash} aria-hidden="true">
                /
              </span>
              <span className={styles.brandSignal}>{t('dashboardEvidenceFirst')}</span>
            </p>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowMark} aria-hidden="true" />
              {t('dashboardEyebrow')}
            </p>
            <h1 className={styles.title}>
              {t('dashboardTitle')}{' '}
              <span className={styles.titleAccent}>{t('dashboardTitleAccent')}</span>
            </h1>
            <p className={styles.intro}>{t('dashboardIntro')}</p>
            <div className={styles.heroMeta}>
              {isReady ? (
                <p className={styles.seed}>
                  {t('dashboardSeed')}: {ready.dataset.scenarioId} ·{' '}
                  {t('dashboardProvenance')}: {ready.dataset.provenance}
                </p>
              ) : null}
              {isReady ? (
                <div
                  className={styles.heroReadout}
                  aria-label={t('dashboardCatalogueReadout')}
                >
                  <span className={styles.readoutValue}>{ready.totalCount}</span>
                  <div className={styles.readoutCopy}>
                    <span className={styles.readoutLabel}>
                      {t('dashboardCatalogueReadout')}
                    </span>
                    <span className={styles.readoutSub}>
                      {t('dashboardEvidenceFirst')}
                    </span>
                  </div>
                </div>
              ) : (
                <div className={styles.heroReadoutGhost} aria-hidden="true" />
              )}
            </div>
          </div>

          <div className={styles.heroAside}>
            <div className={styles.legend} aria-hidden="true">
              <span className={styles.legendItem}>
                <i className={styles.legendObserved} />
                OBS
              </span>
              <span className={styles.legendItem}>
                <i className={styles.legendAlt} />
                ALT
              </span>
              <span className={styles.legendItem}>
                <i className={styles.legendScan} />
                AI
              </span>
            </div>
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
