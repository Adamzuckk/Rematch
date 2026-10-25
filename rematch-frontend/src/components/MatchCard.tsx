import { useState } from 'react'
import { useLocale } from '../i18n/locale'
import { teamHue, teamMonogram } from '../lib/teamIdentity'
import { matchService, MatchApiError } from '../services/matches'
import type { MatchScore, MatchSummary, Team } from '../types'
import { Button } from './ui/Button'
import { StatusLabel } from './ui/StatusLabel'
import styles from './MatchCard.module.css'

interface MatchCardProps {
  match: MatchSummary
  onMatchUpdated?: (match: MatchSummary) => void
  /** Subtle lead accent for the first live match — same dimensions as siblings */
  featured?: boolean
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

function formatKickoffTime(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function scoreResult(score: MatchScore | undefined): 'home' | 'away' | 'draw' | 'none' {
  if (!score) return 'none'
  if (score.home > score.away) return 'home'
  if (score.away > score.home) return 'away'
  return 'draw'
}

function TeamIdentity({
  team,
  side,
  emphasis,
}: {
  team: Team
  side: 'home' | 'away'
  emphasis?: 'win' | 'loss' | 'draw' | 'neutral'
}) {
  const monogram = teamMonogram(team)
  const hue = teamHue(team.id)
  const kitStyle =
    side === 'home'
      ? {
          ['--kit-a' as string]: `hsl(${98 + hue * 0.15} 55% ${42 + (hue % 8)}%)`,
          ['--kit-b' as string]: `hsl(${110 + hue * 0.1} 48% ${28 + (hue % 6)}%)`,
        }
      : {
          ['--kit-a' as string]: `hsl(${195 + hue * 0.2} 58% ${48 + (hue % 7)}%)`,
          ['--kit-b' as string]: `hsl(${205 + hue * 0.15} 45% ${32 + (hue % 5)}%)`,
        }

  const kit = (
    <span className={styles.kit} style={kitStyle} aria-hidden="true">
      <span className={styles.monogram}>{monogram}</span>
    </span>
  )

  const copy = (
    <div className={styles.teamCopy}>
      <span className={styles.teamName}>{team.name}</span>
      <span className={styles.coach}>{team.coachName ?? '\u00a0'}</span>
    </div>
  )

  return (
    <div
      className={[
        styles.team,
        side === 'home' ? styles.teamHome : styles.teamAway,
        emphasis === 'win' ? styles.teamWin : '',
        emphasis === 'loss' ? styles.teamLoss : '',
        emphasis === 'draw' ? styles.teamDraw : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Kits always flank the score: home is copy→kit, away is kit→copy */}
      {side === 'home' ? (
        <>
          {copy}
          {kit}
        </>
      ) : (
        <>
          {kit}
          {copy}
        </>
      )}
    </div>
  )
}

export function MatchCard({ match, onMatchUpdated, featured = false }: MatchCardProps) {
  const { t, locale } = useLocale()
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
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
  const result = scoreResult(match.score)
  const homeEmphasis =
    result === 'home' ? 'win' : result === 'away' ? 'loss' : result === 'draw' ? 'draw' : 'neutral'
  const awayEmphasis =
    result === 'away' ? 'win' : result === 'home' ? 'loss' : result === 'draw' ? 'draw' : 'neutral'

  async function handleStart() {
    setStarting(true)
    setStartError(null)
    try {
      const started = await matchService.startMatch(match.id)
      onMatchUpdated?.(started.match)
    } catch (cause) {
      const message =
        cause instanceof MatchApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : t('startMatchError')
      setStartError(message)
    } finally {
      setStarting(false)
    }
  }

  return (
    <article
      className={[styles.card, featured ? styles.featured : ''].filter(Boolean).join(' ')}
      data-status={match.status}
      data-result={result}
      aria-label={`${homeName} ${t('versus')} ${awayName}, ${statusAnnouncement}`}
    >
      <div className={styles.edge} aria-hidden="true" />

      <header className={styles.mast}>
        <div className={styles.mastStatus}>
          <StatusLabel status={match.status} />
          {match.status === 'live' && match.minute != null ? (
            <span className={styles.clock} aria-label={`${match.minute}'`}>
              <span className={styles.clockPulse} aria-hidden="true" />
              {match.minute}&prime;
            </span>
          ) : null}
          {match.status === 'finished' ? (
            <span className={styles.ftChip} aria-hidden="true">
              FT
            </span>
          ) : null}
          {match.status === 'upcoming' ? (
            <span className={styles.kickChip}>{formatKickoffTime(match.kickoffAt, locale)}</span>
          ) : null}
          {match.provenance === 'synthetic' ? (
            <StatusLabel status="demo" showDot={false} />
          ) : null}
        </div>
        <div className={styles.mastMeta}>
          <span className={styles.competition}>{match.competition}</span>
          {match.homeFormation && match.awayFormation ? (
            <span className={styles.formations} aria-hidden="true">
              {match.homeFormation}
              <span className={styles.formSep}>·</span>
              {match.awayFormation}
            </span>
          ) : null}
        </div>
      </header>

      <div className={styles.stage}>
        <TeamIdentity team={match.homeTeam} side="home" emphasis={homeEmphasis} />

        <div className={styles.scoreBlock}>
          {match.score ? (
            <div
              className={styles.score}
              aria-label={`${homeName} ${match.score.home} ${t('versus')} ${awayName} ${match.score.away}`}
            >
              <span className={styles.scoreHome}>{match.score.home}</span>
              <span className={styles.scoreSep} aria-hidden="true">
                –
              </span>
              <span className={styles.scoreAway}>{match.score.away}</span>
            </div>
          ) : (
            <div className={styles.vsFrame}>
              <span className={styles.vs}>{t('vsShort')}</span>
            </div>
          )}
        </div>

        <TeamIdentity team={match.awayTeam} side="away" emphasis={awayEmphasis} />
      </div>

      <footer className={styles.footer}>
        <div className={styles.meta}>
          {match.venue ? <span className={styles.venue}>{match.venue}</span> : null}
          <span className={styles.kickoff}>{formatKickoff(match.kickoffAt, locale)}</span>
        </div>

        <div className={styles.actions}>
          {match.canStart && match.status === 'upcoming' ? (
            <Button
              variant="primary"
              className={styles.cta}
              onClick={() => void handleStart()}
              disabled={starting}
            >
              {starting ? t('startingMatch') : t('startMatch')}
            </Button>
          ) : (
            <Button variant="primary" to={analysisPath} className={styles.cta}>
              {t('analyseMatch')}
            </Button>
          )}
          <Button variant="secondary" to={insightsPath} className={styles.secondaryCta}>
            {t('insights')}
          </Button>
        </div>
        {startError ? <p className={styles.startError}>{startError}</p> : null}
      </footer>
    </article>
  )
}
