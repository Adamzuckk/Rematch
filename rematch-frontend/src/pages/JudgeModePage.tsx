import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useLocale } from '../i18n/locale'
import { matchService } from '../services/matches'
import type { MatchSummary } from '../types'
import styles from './JudgeModePage.module.css'

/**
 * One-click path for hackathon judges: pick a Phase 8 match and walk the story.
 */
export function JudgeModePage() {
  const { t } = useLocale()
  const [matches, setMatches] = useState<MatchSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => matchService.getMatches({}))
      .then((items) => {
        if (cancelled) return
        setMatches(Array.isArray(items) ? items : [])
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load matches')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const primary = matches[0]

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>{t('judgeEyebrow')}</p>
        <h1>{t('judgeTitle')}</h1>
        <p>{t('judgeIntro')}</p>
      </header>

      <ol className={styles.steps}>
        <li>{t('judgeStep1')}</li>
        <li>{t('judgeStep2')}</li>
        <li>{t('judgeStep3')}</li>
        <li>{t('judgeStep4')}</li>
        <li>{t('judgeStep5')}</li>
      </ol>

      {error ? <p className={styles.error}>{error}</p> : null}

      {primary ? (
        <div className={styles.actions}>
          <Link className={styles.cta} to={`/matches/${primary.id}`}>
            {t('judgeStartReplay')} — {primary.homeTeam?.shortName ?? primary.homeTeam?.name} vs{' '}
            {primary.awayTeam?.shortName ?? primary.awayTeam?.name}
          </Link>
          <Link className={styles.secondary} to={`/matches/${primary.id}/insights`}>
            {t('judgeOpenInsights')}
          </Link>
          <Link className={styles.secondary} to="/metrics">
            {t('navMetrics')}
          </Link>
        </div>
      ) : (
        <p className={styles.muted}>{t('judgeLoading')}</p>
      )}

      <section className={styles.note}>
        <h2>{t('judgeDisclaimerHeading')}</h2>
        <p>{t('judgeDisclaimer')}</p>
      </section>
    </div>
  )
}
