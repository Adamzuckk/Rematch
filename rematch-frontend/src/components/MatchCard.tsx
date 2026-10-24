import { useLocale } from '../i18n/locale'
import type { MatchSummary } from '../types'
import { Button } from './ui/Button'
import { StatusLabel } from './ui/StatusLabel'
import styles from './MatchCard.module.css'

interface MatchCardProps {
  match: MatchSummary
}

function formatKickoff(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function MatchCard({ match }: MatchCardProps) {
  const { t, locale } = useLocale()
  const analysisPath = `/matches/${match.id}`
  const insightsPath = `/matches/${match.id}/insights`
  const homeName = match.homeTeam.name
  const awayName = match.awayTeam.name
  const statusAnnouncement =
    match.status === 'live'
      ? t('filterLive')
      : match.status === 'finished'
        ? t('filterFinished')
        : t('filterUpcoming')

  const descriptionParts = [
    match.competition,
    match.venue,
    formatKickoff(match.kickoffAt, locale),
  ].filter(Boolean)

  return (
    <article
      className={styles.card}
      data-status={match.status}
      aria-label={`${homeName} ${t('versus')} ${awayName}, ${statusAnnouncement}`}
    >
      <div className={styles.fixture}>
        <div className={styles.teamHome}>
          <span className={styles.teamName}>{homeName}</span>
          <span className={styles.kitHome} aria-hidden="true" />
        </div>

        <div className={styles.scoreBlock}>
          {match.score ? (
            <span
              className={styles.score}
              aria-label={`${homeName} ${match.score.home} ${t('versus')} ${awayName} ${match.score.away}`}
            >
              <span>{match.score.home}</span>
              <span className={styles.scoreSep} aria-hidden="true">
                -
              </span>
              <span>{match.score.away}</span>
            </span>
          ) : (
            <span className={styles.vs}>{t('vsShort')}</span>
          )}
        </div>

        <div className={styles.teamAway}>
          <span className={styles.kitAway} aria-hidden="true" />
          <span className={styles.teamName}>{awayName}</span>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.meta}>
          <div className={styles.metaRow}>
            <StatusLabel status={match.status} />
            {match.provenance === 'synthetic' ? (
              <StatusLabel status="demo" showDot={false} />
            ) : null}
            {match.status === 'live' && match.minute != null ? (
              <span className={styles.liveMinute}>{match.minute}&prime;</span>
            ) : null}
          </div>
          <p className={styles.description}>{descriptionParts.join(' · ')}</p>
        </div>

        <div className={styles.actions}>
          <Button variant="primary" to={analysisPath} className={styles.cta}>
            {t('analyseMatch')}
          </Button>
          <Button variant="secondary" to={insightsPath} className={styles.secondaryCta}>
            {t('insights')}
          </Button>
        </div>
      </div>
    </article>
  )
}
