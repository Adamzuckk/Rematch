import type { MatchSummary } from '../../types'
import { StatusLabel } from '../ui/StatusLabel'
import styles from './MatchHeader.module.css'

export interface MatchHeaderProps {
  match: MatchSummary
  versusLabel?: string
  scheduledLabel?: string
  locale?: string
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

export function MatchHeader({
  match,
  versusLabel = 'versus',
  scheduledLabel = 'Scheduled',
  locale = 'en',
}: MatchHeaderProps) {
  return (
    <header
      className={[styles.root, match.status === 'live' ? styles.live : '']
        .filter(Boolean)
        .join(' ')}
    >
      {match.status === 'live' ? <span className={styles.liveScan} aria-hidden="true" /> : null}
      <div className={styles.top}>
        <p className={styles.competition}>{match.competition}</p>
        <div className={styles.badges}>
          <StatusLabel status={match.status} />
          {match.provenance === 'synthetic' ? (
            <StatusLabel status="demo" showDot={false} />
          ) : null}
        </div>
      </div>

      <div
        className={styles.scoreboard}
        aria-label={`${match.homeTeam.name} ${versusLabel} ${match.awayTeam.name}`}
      >
        <div className={styles.team}>
          <span className={styles.teamName}>{match.homeTeam.name}</span>
          {match.homeTeam.shortName ? (
            <span className={styles.short}>{match.homeTeam.shortName}</span>
          ) : null}
        </div>

        <div className={styles.scoreBlock}>
          {match.score ? (
            <p className={styles.score} aria-live="polite">
              <span aria-label={`${match.homeTeam.name} ${match.score.home}`}>
                {match.score.home}
              </span>
              <span className={styles.scoreSep} aria-hidden="true">
                –
              </span>
              <span aria-label={`${match.awayTeam.name} ${match.score.away}`}>
                {match.score.away}
              </span>
            </p>
          ) : (
            <p className={styles.scheduled}>{scheduledLabel}</p>
          )}
          {match.status === 'live' && match.minute != null ? (
            <p className={styles.minute}>{match.minute}&prime;</p>
          ) : null}
        </div>

        <div className={[styles.team, styles.teamAway].join(' ')}>
          <span className={styles.teamName}>{match.awayTeam.name}</span>
          {match.awayTeam.shortName ? (
            <span className={styles.short}>{match.awayTeam.shortName}</span>
          ) : null}
        </div>
      </div>

      <div className={styles.meta}>
        <span>{formatKickoff(match.kickoffAt, locale)}</span>
        {match.venue ? <span>{match.venue}</span> : null}
        <span className={styles.seed}>
          {match.scenarioId} · {match.provenance}
        </span>
      </div>
    </header>
  )
}
