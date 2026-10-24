import { useMemo } from 'react'
import type { MatchEvent, MatchFrame, MatchSummary, Player } from '../../types'
import {
  buildPassNetwork,
  buildPlayerTable,
  buildShotRace,
  buildTeamComparison,
  type MatchCentreStatKey,
} from '../../lib/matchCentre'
import { useLocale } from '../../i18n/locale'
import type { MessageKey } from '../../i18n/strings'
import { PassNetworkPitch } from './PassNetworkPitch'
import styles from './MatchCentre.module.css'

const STAT_LABELS: Record<MatchCentreStatKey, MessageKey> = {
  passes: 'matchCentreStatPasses',
  shots: 'matchCentreStatShots',
  carries: 'matchCentreStatCarries',
  tackles: 'matchCentreStatTackles',
  pressures: 'matchCentreStatPressures',
  events: 'matchCentreStatEvents',
}

export type MatchCentreSection =
  | 'comparison'
  | 'shotRace'
  | 'players'
  | 'networks'
  | 'squad'

const ALL_SECTIONS: MatchCentreSection[] = [
  'comparison',
  'shotRace',
  'players',
  'networks',
  'squad',
]

export interface MatchCentreProps {
  match: MatchSummary
  events: MatchEvent[]
  players: Player[]
  frames: MatchFrame[]
  /** Which analytics blocks to render. Defaults to all. */
  sections?: MatchCentreSection[]
  /** Hide the large Match Centre title block. */
  hideHeader?: boolean
  /** Compact spacing for nested workspaces. */
  dense?: boolean
  /** Wrap pass networks / squad in expandable details. */
  expandableAdvanced?: boolean
  /** Allow sorting the involvement table by column. */
  sortablePlayers?: boolean
}

function racePolyline(
  points: { minute: number; value: number }[],
  maxMinute: number,
  maxValue: number,
  width: number,
  baseline: number,
): string {
  if (points.length === 0 || maxValue <= 0) return ''
  return points
    .map((point) => {
      const x = (point.minute / Math.max(maxMinute, 1)) * width
      const y = baseline - (point.value / maxValue) * (baseline - 8)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function sortSquad(list: Player[]): Player[] {
  return [...list].sort((a, b) => {
    const an = a.shirtNumber ?? Number.POSITIVE_INFINITY
    const bn = b.shirtNumber ?? Number.POSITIVE_INFINITY
    if (an !== bn) return an - bn
    return a.name.localeCompare(b.name)
  })
}

export function MatchCentre({
  match,
  events,
  players,
  frames,
  sections = ALL_SECTIONS,
  hideHeader = false,
  dense = false,
  expandableAdvanced = false,
  sortablePlayers = false,
}: MatchCentreProps) {
  const { t } = useLocale()
  const show = (section: MatchCentreSection) => sections.includes(section)

  const comparison = useMemo(
    () =>
      buildTeamComparison(events, match.homeTeam.id, match.awayTeam.id),
    [events, match.homeTeam.id, match.awayTeam.id],
  )

  const race = useMemo(
    () => buildShotRace(events, match.homeTeam.id, match.awayTeam.id),
    [events, match.homeTeam.id, match.awayTeam.id],
  )

  const playerRows = useMemo(
    () => buildPlayerTable(events, players).slice(0, 12),
    [events, players],
  )

  const homeNetwork = useMemo(
    () => buildPassNetwork(events, players, frames, match.homeTeam),
    [events, players, frames, match.homeTeam],
  )

  const awayNetwork = useMemo(
    () => buildPassNetwork(events, players, frames, match.awayTeam),
    [events, players, frames, match.awayTeam],
  )

  const homeSquad = useMemo(
    () => sortSquad(players.filter((p) => p.teamId === match.homeTeam.id)),
    [players, match.homeTeam.id],
  )

  const awaySquad = useMemo(
    () => sortSquad(players.filter((p) => p.teamId === match.awayTeam.id)),
    [players, match.awayTeam.id],
  )

  const hasEvents = events.length > 0
  const chartW = 600
  const chartH = 160
  const baseline = 150
  const maxMinute = Math.max(90, ...race.map((p) => p.minute), 1)
  const maxRace = Math.max(1, ...race.map((p) => Math.max(p.home, p.away)))
  const homeLine = racePolyline(
    race.map((p) => ({ minute: p.minute, value: p.home })),
    maxMinute,
    maxRace,
    chartW,
    baseline,
  )
  const awayLine = racePolyline(
    race.map((p) => ({ minute: p.minute, value: p.away })),
    maxMinute,
    maxRace,
    chartW,
    baseline,
  )
  const raceEnd = race.length > 0 ? race[race.length - 1] : null

  const comparisonBlock = show('comparison') ? (
    <div className={styles.panel} data-testid="match-centre-comparison">
      <h3 className="sr-only">{t('matchCentreComparison')}</h3>
      <div className={styles.teamLegend}>
        <span className={styles.homeBadge}>
          {match.homeTeam.shortName ?? match.homeTeam.name}
        </span>
        <span className={styles.panelHint}>{t('matchCentreComparison')}</span>
        <span className={styles.awayBadge}>
          {match.awayTeam.shortName ?? match.awayTeam.name}
        </span>
      </div>
      <ul className={styles.bars}>
        {comparison.map((row) => {
          const total = row.home + row.away
          const homePct = total === 0 ? 50 : (row.home / total) * 100
          const homeLeads = row.home > row.away
          const awayLeads = row.away > row.home
          return (
            <li key={row.key} className={styles.barRow}>
              <div className={styles.barMeta}>
                <span
                  className={`${styles.barValue} ${homeLeads ? styles.barValueLead : ''}`}
                >
                  {row.home}
                </span>
                <span className={styles.barLabel}>
                  {t(STAT_LABELS[row.key])}
                </span>
                <span
                  className={`${styles.barValue} ${styles.barValueEnd} ${awayLeads ? styles.barValueLead : ''}`}
                >
                  {row.away}
                </span>
              </div>
              <div
                className={styles.barTrack}
                role="img"
                aria-label={`${t(STAT_LABELS[row.key])}: ${row.home}–${row.away}`}
              >
                <span
                  className={styles.barHome}
                  style={{
                    width: `${homePct}%`,
                    opacity: homeLeads || total === 0 ? 1 : 0.45,
                  }}
                />
                <span
                  className={styles.barAway}
                  style={{
                    width: `${100 - homePct}%`,
                    opacity: awayLeads || total === 0 ? 1 : 0.45,
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  ) : null

  const shotRaceBlock = show('shotRace') ? (
    <div className={styles.panel} data-testid="match-centre-shot-race">
      <div className={styles.raceHeader}>
        <h3 className={styles.panelTitle}>{t('matchCentreShotRace')}</h3>
        {raceEnd ? (
          <p className={styles.raceScore} aria-hidden="true">
            <span>{raceEnd.home}</span>
            <span className={styles.raceScoreSep}>/</span>
            <span>{raceEnd.away}</span>
          </p>
        ) : null}
      </div>
      <p className={styles.panelHint}>{t('matchCentreShotRaceHint')}</p>
      {race.length <= 1 ? (
        <p className={styles.emptyInline}>{t('matchCentreNoShots')}</p>
      ) : (
        <>
          <svg
            className={styles.raceChart}
            viewBox={`0 0 ${chartW} ${chartH}`}
            role="img"
            aria-label={t('matchCentreShotRace')}
          >
            {[0.25, 0.5, 0.75].map((frac) => {
              const y = baseline - frac * (baseline - 8)
              return (
                <line
                  key={frac}
                  x1="0"
                  y1={y}
                  x2={chartW}
                  y2={y}
                  className={styles.raceGrid}
                />
              )
            })}
            <line
              x1="0"
              y1={baseline}
              x2={chartW}
              y2={baseline}
              className={styles.raceAxis}
            />
            {homeLine ? (
              <polyline
                points={homeLine}
                className={styles.raceHome}
                fill="none"
              />
            ) : null}
            {awayLine ? (
              <polyline
                points={awayLine}
                className={styles.raceAway}
                fill="none"
              />
            ) : null}
          </svg>
          <div className={styles.raceLegend}>
            <span className={styles.raceLegendHome}>
              <i className={styles.raceSwatchHome} aria-hidden="true" />
              {match.homeTeam.name}
            </span>
            <span className={styles.raceLegendAway}>
              <i className={styles.raceSwatchAway} aria-hidden="true" />
              {match.awayTeam.name}
            </span>
          </div>
        </>
      )}
    </div>
  ) : null

  const playersBlock = show('players') ? (
    <div className={styles.panel} data-testid="match-centre-players">
      <h3 className={styles.panelTitle}>{t('matchCentrePlayers')}</h3>
      <p className={styles.panelHint}>{t('matchCentrePlayersHint')}</p>
      {playerRows.length === 0 ? (
        <p className={styles.emptyInline}>{t('matchCentreNoPlayers')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('matchCentreColPlayer')}</th>
                <th scope="col">{t('matchCentreStatPasses')}</th>
                <th scope="col">{t('matchCentreStatShots')}</th>
                <th scope="col">{t('matchCentreColTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {(sortablePlayers
                ? [...playerRows].sort((a, b) => b.total - a.total)
                : playerRows
              ).map((row) => (
                <tr key={row.playerId}>
                  <td>
                    <span className={styles.playerName}>
                      {row.shirtNumber != null ? (
                        <span className={styles.shirt}>{row.shirtNumber}</span>
                      ) : null}
                      {row.name}
                    </span>
                  </td>
                  <td>{row.passes}</td>
                  <td>{row.shots}</td>
                  <td className={styles.totalCell}>{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  ) : null

  const networksInner = (
    <div className={styles.passGrid} data-testid="match-centre-networks">
      <PassNetworkPitch
        network={homeNetwork}
        label={`${t('matchCentrePassNetwork')} · ${match.homeTeam.name}`}
        teamName={match.homeTeam.shortName ?? match.homeTeam.name}
        side="home"
        emptyLabel={t('matchCentrePassNetworkEmpty')}
      />
      <PassNetworkPitch
        network={awayNetwork}
        label={`${t('matchCentrePassNetwork')} · ${match.awayTeam.name}`}
        teamName={match.awayTeam.shortName ?? match.awayTeam.name}
        side="away"
        emptyLabel={t('matchCentrePassNetworkEmpty')}
      />
    </div>
  )

  const networksBlock = show('networks') ? (
    expandableAdvanced ? (
      <details className={styles.expandable}>
        <summary className={styles.expandSummary}>
          {t('matchCentreExpandNetworks')}
        </summary>
        <div className={styles.passSection}>
          <p className={styles.panelHint}>{t('matchCentrePassNetworksHint')}</p>
          {networksInner}
        </div>
      </details>
    ) : (
      <div className={styles.passSection}>
        <div className={styles.passHeader}>
          <h3 className={styles.sectionTitle}>
            {t('matchCentrePassNetworks')}
            <span className={styles.titleDot} aria-hidden="true" />
          </h3>
          <p className={styles.panelHint}>{t('matchCentrePassNetworksHint')}</p>
        </div>
        {networksInner}
      </div>
    )
  ) : null

  const squadInner = (
    <div className={styles.squadGrid} data-testid="match-centre-squad">
      <SquadPanel
        teamLabel={match.homeTeam.name}
        side="home"
        players={homeSquad}
        emptyLabel={t('matchCentreSquadEmpty')}
      />
      <SquadPanel
        teamLabel={match.awayTeam.name}
        side="away"
        players={awaySquad}
        emptyLabel={t('matchCentreSquadEmpty')}
      />
    </div>
  )

  const squadBlock = show('squad') ? (
    expandableAdvanced ? (
      <details className={styles.expandable}>
        <summary className={styles.expandSummary}>
          {t('matchCentreExpandSquad')}
        </summary>
        <div className={styles.squadSection}>
          <p className={styles.panelHint}>{t('matchCentreSquadHint')}</p>
          {squadInner}
        </div>
      </details>
    ) : (
      <div className={styles.squadSection}>
        <div className={styles.passHeader}>
          <h3 className={styles.sectionTitle}>
            {t('matchCentreSquad')}
            <span className={styles.titleDot} aria-hidden="true" />
          </h3>
          <p className={styles.panelHint}>{t('matchCentreSquadHint')}</p>
        </div>
        {squadInner}
      </div>
    )
  ) : null

  const showNumbersGrid =
    (show('comparison') || show('shotRace') || show('players')) && hasEvents
  const showRightColumn = show('shotRace') || show('players')

  return (
    <section
      className={[styles.root, dense ? styles.dense : ''].filter(Boolean).join(' ')}
      aria-labelledby={hideHeader ? undefined : 'match-centre-title'}
      data-testid="match-centre"
    >
      {!hideHeader ? (
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>{t('matchCentreEyebrow')}</p>
            <h2 id="match-centre-title" className={styles.title}>
              {t('matchCentreTitle')}{' '}
              <span className={styles.titleAccent}>{t('matchCentreTitleAccent')}</span>
              <span className={styles.titleDot} aria-hidden="true" />
            </h2>
          </div>
          <p className={styles.note}>{t('matchCentreNote')}</p>
        </header>
      ) : null}

      {!hasEvents ? (
        <p className={styles.empty} role="status">
          {t('matchCentreEmpty')}
        </p>
      ) : (
        <>
          {showNumbersGrid ? (
            <div
              className={
                show('comparison') && showRightColumn
                  ? styles.numbersGrid
                  : styles.numbersSingle
              }
            >
              {comparisonBlock}
              {showRightColumn ? (
                <div className={styles.rightColumn}>
                  {shotRaceBlock}
                  {playersBlock}
                </div>
              ) : null}
            </div>
          ) : null}
          {networksBlock}
          {squadBlock}
        </>
      )}
    </section>
  )
}

function SquadPanel({
  teamLabel,
  side,
  players,
  emptyLabel,
}: {
  teamLabel: string
  side: 'home' | 'away'
  players: Player[]
  emptyLabel: string
}) {
  return (
    <div className={styles.squadPanel}>
      <div className={styles.squadHead}>
        <span
          className={side === 'home' ? styles.homeBadge : styles.awayBadge}
        >
          {teamLabel}
        </span>
      </div>
      {players.length === 0 ? (
        <p className={styles.emptyInline}>{emptyLabel}</p>
      ) : (
        <ul className={styles.squadList}>
          {players.map((player) => (
            <li key={player.id} className={styles.squadRow}>
              <span
                className={
                  side === 'home' ? styles.squadShirtHome : styles.squadShirtAway
                }
              >
                {player.shirtNumber ?? '·'}
              </span>
              <span className={styles.squadName}>{player.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
