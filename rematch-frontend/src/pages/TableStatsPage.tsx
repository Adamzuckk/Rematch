import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { useLocale } from '../i18n/locale'
import type { MessageKey } from '../i18n/strings'
import {
  aggregatePlayerStatsFromSources,
  isMetricSupported,
  rankPlayersByMetric,
  type AggregatedPlayerStat,
  type PlayerPositionFilter,
  type PlayerStatMetric,
} from '../lib/playerStatRankings'
import {
  buildStandings,
  competitionsFromMatches,
  teamsFromMatches,
  type FormResult,
  type TeamStanding,
} from '../lib/standings'
import { matchService } from '../services/matches'
import type { MatchSummary, Team } from '../types'
import styles from './TableStatsPage.module.css'

type PageTab = 'table' | 'playerStats'

const DEFAULT_METRIC: PlayerStatMetric = 'goals'
const DEFAULT_POSITION: PlayerPositionFilter = 'all'

const METRIC_OPTIONS: { id: PlayerStatMetric; labelKey: MessageKey }[] = [
  { id: 'goals', labelKey: 'tableStatsMetricGoals' },
  { id: 'assists', labelKey: 'tableStatsMetricAssists' },
  { id: 'goalsAssists', labelKey: 'tableStatsMetricGoalsAssists' },
  { id: 'xg', labelKey: 'tableStatsMetricXg' },
  { id: 'cleanSheets', labelKey: 'tableStatsMetricCleanSheets' },
  { id: 'yellowCards', labelKey: 'tableStatsMetricYellowCards' },
  { id: 'redCards', labelKey: 'tableStatsMetricRedCards' },
  { id: 'fouls', labelKey: 'tableStatsMetricFouls' },
  { id: 'penaltiesSaved', labelKey: 'tableStatsMetricPenaltiesSaved' },
  { id: 'appearances', labelKey: 'tableStatsMetricAppearances' },
  { id: 'minutesPlayed', labelKey: 'tableStatsMetricMinutes' },
  { id: 'ownGoals', labelKey: 'tableStatsMetricOwnGoals' },
]

const POSITION_OPTIONS: { id: PlayerPositionFilter; labelKey: MessageKey }[] = [
  { id: 'all', labelKey: 'tableStatsPositionAll' },
  { id: 'goalkeeper', labelKey: 'tableStatsPositionGk' },
  { id: 'defender', labelKey: 'tableStatsPositionDf' },
  { id: 'midfielder', labelKey: 'tableStatsPositionMf' },
  { id: 'forward', labelKey: 'tableStatsPositionFw' },
]

const FORM_LABEL: Record<FormResult, MessageKey> = {
  W: 'tableStatsFormWin',
  D: 'tableStatsFormDraw',
  L: 'tableStatsFormLoss',
}

function onTabListKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  tabs: PageTab[],
  current: PageTab,
  setCurrent: (tab: PageTab) => void,
) {
  const index = tabs.indexOf(current)
  if (index < 0) return

  let nextIndex: number | null = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (index + 1) % tabs.length
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (index - 1 + tabs.length) % tabs.length
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = tabs.length - 1
  }
  if (nextIndex == null) return

  event.preventDefault()
  const nextTab = tabs[nextIndex]
  if (nextTab) setCurrent(nextTab)
}

function formClass(result: FormResult): string {
  if (result === 'W') return styles.formW ?? ''
  if (result === 'D') return styles.formD ?? ''
  return styles.formL ?? ''
}

function positionLabelKey(
  group: AggregatedPlayerStat['positionGroup'],
): MessageKey {
  if (group === 'goalkeeper') return 'tableStatsPositionGk'
  if (group === 'defender') return 'tableStatsPositionDf'
  if (group === 'midfielder') return 'tableStatsPositionMf'
  if (group === 'forward') return 'tableStatsPositionFw'
  return 'tableStatsPositionUnknown'
}

export function TableStatsPage() {
  const { t } = useLocale()
  const tabsId = useId()
  const [tab, setTab] = useState<PageTab>('table')
  const [matches, setMatches] = useState<MatchSummary[] | null>(null)
  const [players, setPlayers] = useState<AggregatedPlayerStat[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [competition, setCompetition] = useState<string>('all')
  const [metric, setMetric] = useState<PlayerStatMetric>(DEFAULT_METRIC)
  const [clubId, setClubId] = useState<string>('all')
  const [position, setPosition] =
    useState<PlayerPositionFilter>(DEFAULT_POSITION)

  const retry = useCallback(() => {
    setError(null)
    setMatches(null)
    setPlayers(null)
    setReloadToken((value) => value + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const catalogue = await matchService.getMatches()
        if (cancelled) return

        const sources = await Promise.all(
          catalogue.map(async (item) => {
            const [events, matchPlayers, context] = await Promise.all([
              matchService.getMatchEvents(item.id).catch(() => []),
              matchService.getMatchPlayers(item.id).catch(() => []),
              matchService.getMatchContext(item.id).catch(() => null),
            ])
            const contextPlayers = context
              ? [...context.homePlayers, ...context.awayPlayers]
              : []
            const byId = new Map<string, (typeof matchPlayers)[number]>()
            for (const player of [...matchPlayers, ...contextPlayers]) {
              byId.set(player.id, player)
            }
            return {
              match: item,
              players: Array.from(byId.values()),
              events,
              playerStats: context?.playerStats ?? null,
            }
          }),
        )

        if (cancelled) return
        // Single consistent publish — avoid progressive partial standings.
        setMatches(catalogue)
        setPlayers(aggregatePlayerStatsFromSources(sources))
        setError(null)
      } catch (cause: unknown) {
        if (cancelled) return
        setError(
          cause instanceof Error ? cause.message : t('tableStatsLoadError'),
        )
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [reloadToken, t])

  const competitions = useMemo(
    () => (matches ? competitionsFromMatches(matches) : []),
    [matches],
  )

  const standings = useMemo(() => {
    if (!matches) return []
    return buildStandings(matches, {
      competition: competition === 'all' ? null : competition,
    })
  }, [competition, matches])

  const clubs = useMemo((): Team[] => {
    if (!matches) return []
    const scoped =
      competition === 'all'
        ? matches
        : matches.filter((item) => item.competition === competition)
    return teamsFromMatches(scoped)
  }, [competition, matches])

  const rankings = useMemo(() => {
    if (!players) return []
    return rankPlayersByMetric(players, metric, {
      teamId: clubId === 'all' ? null : clubId,
      position,
    })
  }, [clubId, metric, players, position])

  const resetPlayerFilters = () => {
    setMetric(DEFAULT_METRIC)
    setClubId('all')
    setPosition(DEFAULT_POSITION)
  }

  const pageTabs: PageTab[] = ['table', 'playerStats']
  const loading = matches === null && !error

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{t('tableStatsEyebrow')}</p>
        <h1>{t('tableStatsTitle')}</h1>
        <p className={styles.lead}>{t('tableStatsDescription')}</p>
      </header>

      <section className={styles.panel} aria-label={t('tableStatsTitle')}>
        <div
          className={styles.tabs}
          role="tablist"
          aria-label={t('tableStatsTablist')}
          onKeyDown={(event) =>
            onTabListKeyDown(event, pageTabs, tab, setTab)
          }
        >
          <button
            type="button"
            role="tab"
            id={`${tabsId}-table`}
            aria-selected={tab === 'table'}
            aria-controls={`${tabsId}-panel-table`}
            tabIndex={tab === 'table' ? 0 : -1}
            className={tab === 'table' ? styles.tabActive : styles.tab}
            onClick={() => setTab('table')}
          >
            {t('tableStatsTabTable')}
          </button>
          <button
            type="button"
            role="tab"
            id={`${tabsId}-playerStats`}
            aria-selected={tab === 'playerStats'}
            aria-controls={`${tabsId}-panel-playerStats`}
            tabIndex={tab === 'playerStats' ? 0 : -1}
            className={tab === 'playerStats' ? styles.tabActive : styles.tab}
            onClick={() => setTab('playerStats')}
          >
            {t('tableStatsTabPlayerStats')}
          </button>
        </div>

        {loading ? (
          <p className={styles.loading} role="status">
            {t('tableStatsLoading')}
          </p>
        ) : null}

        {error ? (
          <EmptyState
            title={t('tableStatsLoadError')}
            description={error}
            action={
              <Button onClick={retry}>{t('tableStatsRetry')}</Button>
            }
          />
        ) : null}

        {!loading && !error && tab === 'table' ? (
          <div
            role="tabpanel"
            id={`${tabsId}-panel-table`}
            aria-labelledby={`${tabsId}-table`}
            className={styles.tabPanel}
          >
            <TableSection
              competitions={competitions}
              competition={competition}
              onCompetitionChange={setCompetition}
              standings={standings}
            />
          </div>
        ) : null}

        {!loading && !error && tab === 'playerStats' ? (
          <div
            role="tabpanel"
            id={`${tabsId}-panel-playerStats`}
            aria-labelledby={`${tabsId}-playerStats`}
            className={styles.tabPanel}
          >
            <PlayerStatsSection
              metric={metric}
              clubId={clubId}
              position={position}
              clubs={clubs}
              rankings={rankings}
              playersReady={players != null}
              onMetricChange={setMetric}
              onClubChange={setClubId}
              onPositionChange={setPosition}
              onReset={resetPlayerFilters}
            />
          </div>
        ) : null}
      </section>
    </div>
  )
}

function TableSection({
  competitions,
  competition,
  onCompetitionChange,
  standings,
}: {
  competitions: string[]
  competition: string
  onCompetitionChange: (value: string) => void
  standings: TeamStanding[]
}) {
  const { t } = useLocale()

  return (
    <>
      {competitions.length > 1 ? (
        <div className={styles.toolbar}>
          <label>
            <span>{t('tableStatsCompetitionLabel')}</span>
            <select
              value={competition}
              onChange={(event) => onCompetitionChange(event.target.value)}
              aria-label={t('tableStatsCompetitionLabel')}
            >
              <option value="all">{t('tableStatsCompetitionAll')}</option>
              {competitions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {standings.length === 0 ? (
        <EmptyState
          title={t('tableStatsTableEmptyTitle')}
          description={t('tableStatsTableEmptyBody')}
        />
      ) : (
        <div className={styles.standingsBlock}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">
                {t('tableStatsTabTable')}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.num}>
                    #
                  </th>
                  <th scope="col">{t('tableStatsColTeam')}</th>
                  <th scope="col" className={styles.num}>
                    P
                  </th>
                  <th scope="col" className={styles.num}>
                    W
                  </th>
                  <th scope="col" className={styles.num}>
                    D
                  </th>
                  <th scope="col" className={styles.num}>
                    L
                  </th>
                  <th scope="col" className={styles.center}>
                    GF:GA
                  </th>
                  <th scope="col" className={styles.num}>
                    GD
                  </th>
                  <th scope="col" className={styles.center}>
                    Pts
                  </th>
                  <th scope="col">{t('tableStatsColForm')}</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, index) => (
                  <tr key={row.team.id}>
                    <td className={styles.num}>{index + 1}</td>
                    <td>
                      <span className={styles.teamName}>{row.team.name}</span>
                    </td>
                    <td className={styles.num}>{row.played}</td>
                    <td className={styles.num}>{row.won}</td>
                    <td className={styles.num}>{row.drawn}</td>
                    <td className={styles.num}>{row.lost}</td>
                    <td className={styles.center}>
                      {row.goalsFor}:{row.goalsAgainst}
                    </td>
                    <td className={styles.num}>
                      {row.goalDifference > 0 ? '+' : ''}
                      {row.goalDifference}
                    </td>
                    <td className={styles.center}>{row.points}</td>
                    <td>
                      <FormStrip form={row.form} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.legend} aria-label={t('tableStatsLegendTitle')}>
            <p className={styles.legendTitle}>{t('tableStatsLegendTitle')}</p>
            <ul className={styles.legendList}>
              <li>
                <span className={styles.legendKey}>P</span>
                {' — '}
                {t('tableStatsLegendP')}
              </li>
              <li>
                <span className={styles.legendKey}>W</span>
                {' — '}
                {t('tableStatsLegendW')}
              </li>
              <li>
                <span className={styles.legendKey}>D</span>
                {' — '}
                {t('tableStatsLegendD')}
              </li>
              <li>
                <span className={styles.legendKey}>L</span>
                {' — '}
                {t('tableStatsLegendL')}
              </li>
              <li>
                <span className={styles.legendKey}>GF:GA</span>
                {' — '}
                {t('tableStatsLegendGfGa')}
              </li>
              <li>
                <span className={styles.legendKey}>GD</span>
                {' — '}
                {t('tableStatsLegendGd')}
              </li>
              <li>
                <span className={styles.legendKey}>Pts</span>
                {' — '}
                {t('tableStatsLegendPts')}
              </li>
            </ul>
          </div>
        </div>
      )}
    </>
  )
}

function FormStrip({ form }: { form: FormResult[] }) {
  const { t } = useLocale()

  if (form.length === 0) {
    return (
      <span className={styles.form} aria-label={t('tableStatsFormEmpty')}>
        <span className={`${styles.formBadge} ${styles.formEmpty}`}>—</span>
      </span>
    )
  }

  return (
    <span className={styles.form} aria-label={t('tableStatsColForm')}>
      {form.map((result, index) => (
        <button
          key={`${result}-${index}`}
          type="button"
          className={`${styles.formBadge} ${formClass(result)}`}
          title={t(FORM_LABEL[result])}
          aria-label={t(FORM_LABEL[result])}
        >
          {result}
        </button>
      ))}
    </span>
  )
}

function PlayerStatsSection({
  metric,
  clubId,
  position,
  clubs,
  rankings,
  playersReady,
  onMetricChange,
  onClubChange,
  onPositionChange,
  onReset,
}: {
  metric: PlayerStatMetric
  clubId: string
  position: PlayerPositionFilter
  clubs: { id: string; name: string }[]
  rankings: ReturnType<typeof rankPlayersByMetric>
  playersReady: boolean
  onMetricChange: (value: PlayerStatMetric) => void
  onClubChange: (value: string) => void
  onPositionChange: (value: PlayerPositionFilter) => void
  onReset: () => void
}) {
  const { t } = useLocale()
  const supported = isMetricSupported(metric)

  return (
    <>
      <div className={styles.toolbar} role="group" aria-label={t('tableStatsFilters')}>
        <label>
          <span>{t('tableStatsMetricLabel')}</span>
          <select
            value={metric}
            onChange={(event) =>
              onMetricChange(event.target.value as PlayerStatMetric)
            }
            aria-label={t('tableStatsMetricLabel')}
          >
            {METRIC_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('tableStatsClubLabel')}</span>
          <select
            value={clubId}
            onChange={(event) => onClubChange(event.target.value)}
            aria-label={t('tableStatsClubLabel')}
          >
            <option value="all">{t('tableStatsClubAll')}</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('tableStatsPositionLabel')}</span>
          <select
            value={position}
            onChange={(event) =>
              onPositionChange(event.target.value as PlayerPositionFilter)
            }
            aria-label={t('tableStatsPositionLabel')}
          >
            {POSITION_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <Button className={styles.reset} onClick={onReset}>
          <RotateCcw size={15} aria-hidden="true" />
          {t('tableStatsReset')}
        </Button>
      </div>

      {!playersReady ? (
        <p className={styles.loading} role="status">
          {t('tableStatsLoading')}
        </p>
      ) : null}

      {playersReady && !supported ? (
        <div className={styles.unavailable} role="status">
          <strong>{t('tableStatsUnavailableTitle')}</strong>
          <p>{t(unavailableBodyKey(metric))}</p>
        </div>
      ) : null}

      {playersReady && supported && rankings.length === 0 ? (
        <EmptyState
          title={t('tableStatsPlayersEmptyTitle')}
          description={t('tableStatsPlayersEmptyBody')}
        />
      ) : null}

      {playersReady && supported && rankings.length > 0 ? (
        <ol className={styles.playerList}>
          {rankings.map((row) => (
            <li key={row.player.playerId} className={styles.playerRow}>
              <span className={styles.playerRank} aria-label={`${t('tableStatsColRank')} ${row.rank}`}>
                {row.rank}
              </span>
              <div className={styles.playerIdentity}>
                <p className={styles.playerName}>{row.player.playerName}</p>
                <p className={styles.playerClub}>{row.player.teamName}</p>
              </div>
              <span className={styles.playerPosition}>
                {t(positionLabelKey(row.player.positionGroup))}
              </span>
              <span className={styles.playerValue}>{row.value}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </>
  )
}

function unavailableBodyKey(metric: PlayerStatMetric): MessageKey {
  switch (metric) {
    case 'xg':
      return 'tableStatsUnavailableXg'
    case 'penaltiesSaved':
      return 'tableStatsUnavailablePenaltiesSaved'
    case 'minutesPlayed':
      return 'tableStatsUnavailableMinutes'
    default:
      return 'tableStatsUnavailableGeneric'
  }
}
