import { Link, useParams } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import {
  formatMatchLabel,
  useMatchSummary,
} from '../hooks/useMatchSummary'
import { useLocale } from '../i18n/locale'
import { usePersona } from '../context/PersonaContext'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { matchService } from '../services/matches'
import type { MatchIntelligence } from '../types'
import styles from './InsightsPage.module.css'

function templateSummary(
  mode: 'fan' | 'analyst',
  locale: 'en' | 'ar',
  matchLabel: string,
  intel: MatchIntelligence,
): string {
  const top = intel.keyMoments.slice(0, 3).map((m) => m.label).join(', ')
  if (locale === 'ar') {
    if (mode === 'fan') {
      return `${matchLabel}: بيانات اصطناعية فقط. سُجّل ${intel.totalEvents} حدثًا و${intel.alignedFrames} إطارًا محاذيًا. لحظات بارزة: ${top || 'لا يوجد'}. الأرقام من السجل فقط وليست بثًا رسميًا.`
    }
    return `${matchLabel} (محلل): أحداث=${intel.totalEvents}، بإحداثيات=${intel.eventsWithCoordinates}، إطارات=${intel.alignedFrames}، متوسط سرعة الكرة=${intel.avgBallSpeedMps ?? 'غير متاح'} م/ث، متوسط مسافة التمرير=${intel.avgPassDistanceM ?? 'غير متاح'} م. المصدر: ${intel.source}.`
  }
  if (mode === 'fan') {
    return `${matchLabel}: synthetic data only. ${intel.totalEvents} seeded events and ${intel.alignedFrames} aligned frames. Notable moments: ${top || 'none listed'}. Figures come from the recorded seed — not official broadcast tracking.`
  }
  return `${matchLabel} (analyst): events=${intel.totalEvents}, with coordinates=${intel.eventsWithCoordinates}, aligned frames=${intel.alignedFrames}, avg ball speed=${intel.avgBallSpeedMps ?? 'n/a'} m/s, avg pass distance=${intel.avgPassDistanceM ?? 'n/a'} m. Source: ${intel.source}.`
}

export function InsightsPage() {
  const { t, locale } = useLocale()
  const { mode } = usePersona()
  const { matchId } = useParams()
  const matchState = useMatchSummary(matchId)
  const [reloadToken, setReloadToken] = useState(0)
  const [result, setResult] = useState<{
    matchId: string
    intelligence: MatchIntelligence | null
  } | null>(null)
  const [error, setError] = useState<{ matchId: string; message: string } | null>(
    null,
  )

  useEffect(() => {
    if (!matchId) return
    let cancelled = false
    void matchService
      .getMatchIntelligence(matchId)
      .then((intelligence) => {
        if (cancelled) return
        setResult({ matchId, intelligence })
        setError(null)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError({
            matchId,
            message:
              cause instanceof Error
                ? cause.message
                : 'Failed to load match intelligence',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [matchId, reloadToken])

  const retry = useCallback(() => {
    if (!matchId) return
    setResult(null)
    setError(null)
    setReloadToken((value) => value + 1)
  }, [matchId])

  const label =
    matchState.status === 'ready'
      ? formatMatchLabel(matchState.match)
      : `${t('breadcrumbMatch')} ${matchId ?? ''}`

  const isCurrentResult = result?.matchId === matchId
  const currentError = error?.matchId === matchId ? error : null

  if (!matchId || (!isCurrentResult && !currentError)) {
    return (
      <p className={styles.muted} role="status" aria-live="polite">
        {t('insightsLoading')}
      </p>
    )
  }

  if (currentError) {
    return (
      <EmptyState
        title={t('insightsErrorTitle')}
        description={`${t('insightsErrorBody')} ${currentError.message}`}
        action={
          <Button variant="secondary" onClick={retry}>
            {t('insightsRetry')}
          </Button>
        }
      />
    )
  }

  const intel = result?.intelligence ?? null
  if (!intel) {
    return (
      <EmptyState
        title={t('insightsMockTitle')}
        description={t('insightsMockBody')}
        action={
          <Button variant="secondary" to={`/matches/${matchId}`}>
            {t('decisionBackToMatch')}
          </Button>
        }
      />
    )
  }

  const summary = templateSummary(mode, locale, label, intel)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{t('statusSynthetic')}</p>
        <h1>
          {t('insightsTitle')}
          <span aria-hidden="true"> · </span>
          {label}
        </h1>
        <p className={styles.mode}>{mode === 'fan' ? t('modeFan') : t('modeAnalyst')}</p>
      </header>

      <section className={styles.card}>
        <h2>{t('insightsSummaryHeading')}</h2>
        <p>{summary}</p>
      </section>

      <section className={styles.grid}>
        <div className={styles.stat}>
          <span>{t('insightsTotalEvents')}</span>
          <strong>{intel.totalEvents}</strong>
        </div>
        <div className={styles.stat}>
          <span>{t('insightsAlignedFrames')}</span>
          <strong>{intel.alignedFrames}</strong>
        </div>
        <div className={styles.stat}>
          <span>{t('insightsAvgBallSpeed')}</span>
          <strong>{intel.avgBallSpeedMps ?? '—'}</strong>
        </div>
        <div className={styles.stat}>
          <span>{t('insightsAvgPassDistance')}</span>
          <strong>{intel.avgPassDistanceM ?? '—'}</strong>
        </div>
      </section>

      <section className={styles.card}>
        <h2>{t('insightsKeyMoments')}</h2>
        {intel.keyMoments.length === 0 ? (
          <p className={styles.muted}>{t('insightsNoMoments')}</p>
        ) : (
          <ul className={styles.list}>
            {intel.keyMoments.map((m) => (
              <li key={m.eventId}>
                <Link to={`/matches/${matchId}/decisions/${m.eventId}`}>
                  {m.label}
                  {m.hasAlignedFrame ? ` · ${t('insightsFrameBacked')}` : ''}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <h2>{t('insightsLimitations')}</h2>
        <ul className={styles.list}>
          {intel.limitations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
