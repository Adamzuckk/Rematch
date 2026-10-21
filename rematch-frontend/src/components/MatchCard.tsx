import { BarChart3, Radar } from 'lucide-react'
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

  return (
    <article
      className={styles.card}
      data-status={match.status}
      aria-label={`${homeName} ${t('versus')} ${awayName}, ${statusAnnouncement}`}
    >
      {match.status === 'live' ? (
        <span className={styles.liveSignal} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      ) : null}
      <header className={styles.header}>
        <span className={styles.competition}>{match.competition}</span>
        <div className={styles.badges}>
          <StatusLabel status={match.status} />
          {match.provenance === 'synthetic' ? (
            <StatusLabel status="demo" showDot={false} />
          ) : null}
        </div>
      </header>

      <div className={styles.teams}>
        <div className={styles.teamRow}>
          <span className={styles.teamIndex} aria-hidden="true">01</span>
          <span className={styles.teamName}>
            {homeName}
            {match.homeTeam.shortName ? (
              <span className={styles.shortName}>
                {' '}
                ({match.homeTeam.shortName})
              </span>
            ) : null}
          </span>
          {match.score ? (
            <span className={styles.score} aria-label={`${homeName} ${match.score.home}`}>
              {match.score.home}
            </span>
          ) : (
            <span className={styles.scheduled}>{t('vsShort')}</span>
          )}
        </div>
        <div className={styles.teamRow}>
          <span className={styles.teamIndex} aria-hidden="true">02</span>
          <span className={styles.teamName}>
            {awayName}
            {match.awayTeam.shortName ? (
              <span className={styles.shortName}>
                {' '}
                ({match.awayTeam.shortName})
              </span>
            ) : null}
          </span>
          {match.score ? (
            <span className={styles.score} aria-label={`${awayName} ${match.score.away}`}>
              {match.score.away}
            </span>
          ) : (
            <span className={styles.scheduled}>{t('scheduled')}</span>
          )}
        </div>
      </div>

      <div className={styles.meta}>
        <span>{formatKickoff(match.kickoffAt, locale)}</span>
        {match.status === 'live' && match.minute != null ? (
          <span className={styles.liveMinute}>{match.minute}&prime;</span>
        ) : null}
        {match.venue ? <span>{match.venue}</span> : null}
      </div>

      <div className={styles.actions}>
        <Button variant="primary" to={analysisPath}>
          <Radar size={16} aria-hidden="true" />
          {t('analyseMatch')}
        </Button>
        <Button variant="secondary" to={insightsPath}>
          <BarChart3 size={16} aria-hidden="true" />
          {t('insights')}
        </Button>
      </div>
    </article>
  )
}
