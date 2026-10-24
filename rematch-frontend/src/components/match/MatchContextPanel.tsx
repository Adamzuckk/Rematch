import type { MatchContext, TeamFormResult } from '../../types'
import { useLocale } from '../../i18n/locale'
import styles from './MatchContextPanel.module.css'

export interface MatchContextPanelProps {
  context: MatchContext
}

function formStrip(rows: TeamFormResult[]): string {
  return rows
    .slice()
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
    .map((row) => row.result)
    .join(' ')
}

export function MatchContextPanel({ context }: MatchContextPanelProps) {
  const { t } = useLocale()
  const homeForm = formStrip(context.homeForm)
  const awayForm = formStrip(context.awayForm)
  const topStats = context.playerStats.slice(0, 6)

  return (
    <section className={styles.root} aria-label={t('matchContextTitle')}>
      <div className={styles.coaches}>
        <div>
          <p className={styles.label}>{t('matchContextHomeCoach')}</p>
          <p className={styles.value}>
            {context.homeCoachName ?? context.match.homeTeam.coachName ?? '—'}
          </p>
          {context.match.homeFormation ? (
            <p className={styles.meta}>
              {t('matchContextFormation')}: {context.match.homeFormation}
            </p>
          ) : null}
          {homeForm ? (
            <p className={styles.form} aria-label={t('matchContextForm')}>
              {homeForm}
            </p>
          ) : null}
        </div>
        <div className={styles.away}>
          <p className={styles.label}>{t('matchContextAwayCoach')}</p>
          <p className={styles.value}>
            {context.awayCoachName ?? context.match.awayTeam.coachName ?? '—'}
          </p>
          {context.match.awayFormation ? (
            <p className={styles.meta}>
              {t('matchContextFormation')}: {context.match.awayFormation}
            </p>
          ) : null}
          {awayForm ? (
            <p className={styles.form} aria-label={t('matchContextForm')}>
              {awayForm}
            </p>
          ) : null}
        </div>
      </div>

      {topStats.length > 0 ? (
        <div className={styles.stats}>
          <p className={styles.label}>{t('matchContextPlayerStats')}</p>
          <ul className={styles.statList}>
            {topStats.map((row) => (
              <li key={row.playerId}>
                <span className={styles.statName}>
                  {row.shirtNumber != null ? `#${row.shirtNumber} ` : ''}
                  {row.playerName}
                </span>
                <span className={styles.statLine}>
                  {row.goals}G {row.assists}A · {row.shots} shots · {row.fouls}{' '}
                  fouls
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
