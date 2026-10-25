import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { DecisionExplorerPanel } from '../components/decision/DecisionExplorerPanel'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { useDecisionAnalysis } from '../hooks/useDecisionAnalysis'
import { useDecisionNarrative } from '../hooks/useDecisionNarrative'
import { useEventIntelligence } from '../hooks/useEventIntelligence'
import { useMatchSummary, formatMatchLabel } from '../hooks/useMatchSummary'
import { useMatchAnalysis } from '../hooks/useMatchAnalysis'
import { useLocale } from '../i18n/locale'
import styles from './DecisionExplorerPage.module.css'

export function DecisionExplorerPage() {
  const { matchId, eventId } = useParams()
  const { t } = useLocale()
  const { state, retry } = useDecisionAnalysis(matchId, eventId)
  const intelligence = useEventIntelligence(
    matchId,
    eventId,
    Boolean(matchId && eventId),
  )
  const [askedDecisionKey, setAskedDecisionKey] = useState<string | null>(null)
  const decisionKey = matchId && eventId ? `${matchId}:${eventId}` : null
  const intelPreview = intelligence.state
  const hasDecisionPayload =
    state.status === 'ready' ||
    (intelPreview.status === 'ready' &&
      intelPreview.intelligence.decisionAnalysis != null)
  const narrative = useDecisionNarrative(
    matchId,
    eventId,
    hasDecisionPayload && askedDecisionKey === decisionKey,
  )
  const matchState = useMatchSummary(matchId)
  const matchAnalysis = useMatchAnalysis(matchId)

  const matchLabel =
    matchState.status === 'ready'
      ? formatMatchLabel(matchState.match)
      : (matchId ?? '—')

  const backTo = matchId ? `/matches/${matchId}` : '/dashboard'

  if (!matchId || !eventId) {
    return (
      <div className={styles.page}>
        <EmptyState
          title={t('decisionNotFoundTitle')}
          description={t('decisionNotFoundEvent')}
          action={
            <Button variant="secondary" to="/dashboard">
              {t('matchAnalysisBack')}
            </Button>
          }
        />
      </div>
    )
  }

  const intel = intelligence.state
  const decisionPending = state.status === 'idle' || state.status === 'loading'
  const intelPending = intel.status === 'idle' || intel.status === 'loading'
  const waitingForFirstSignal = decisionPending && intelPending

  if (waitingForFirstSignal) {
    return (
      <div className={styles.page}>
        <p className={styles.loading} role="status" aria-live="polite">
          {t('decisionLoading')}
        </p>
      </div>
    )
  }

  // Confirm a missing match/event with both sources before blanking the page.
  if (
    state.status === 'not-found' &&
    (intel.status === 'not-found' ||
      intel.status === 'unavailable' ||
      (intelPending && state.code === 'match_not_found'))
  ) {
    if (intelPending) {
      return (
        <div className={styles.page}>
          <p className={styles.loading} role="status" aria-live="polite">
            {t('decisionLoading')}
          </p>
        </div>
      )
    }
    return (
      <div className={styles.page}>
        <EmptyState
          title={t('decisionNotFoundTitle')}
          description={
            state.code === 'match_not_found'
              ? t('decisionNotFoundMatch')
              : t('decisionNotFoundEvent')
          }
          action={
            <Button variant="secondary" to={backTo}>
              {t('decisionBackToMatch')}
            </Button>
          }
        />
      </div>
    )
  }

  const analysisFromDecision =
    state.status === 'ready' ? state.analysis : undefined
  const analysisFromIntel =
    intel.status === 'ready'
      ? (intel.intelligence.decisionAnalysis ?? undefined)
      : undefined
  // Prefer the dedicated decision endpoint; fall back to nested intel analysis.
  const analysis = analysisFromDecision ?? analysisFromIntel
  const canShowExplorer =
    analysis != null ||
    intel.status === 'ready' ||
    intel.status === 'loading' ||
    intel.status === 'error' ||
    intel.status === 'unavailable' ||
    state.status === 'insufficient-evidence' ||
    state.status === 'error'

  // Decision errors still open the explorer (with retry) when intel can brief
  // the event; only block the page when neither source has a usable signal yet.
  if (!canShowExplorer) {
    return (
      <div className={styles.page}>
        <p className={styles.loading} role="status" aria-live="polite">
          {t('decisionLoading')}
        </p>
      </div>
    )
  }

  const decisionUnavailable =
    analysis == null &&
    (state.status === 'insufficient-evidence' || state.status === 'error')
      ? {
          kind: state.status,
          message: state.message,
          retryable: state.status === 'error' ? state.retryable : true,
        }
      : null

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Button variant="ghost" to={backTo}>
          {t('decisionBackToMatch')}
        </Button>
      </div>
      <DecisionExplorerPanel
        analysis={analysis}
        matchId={matchId}
        eventId={eventId}
        matchLabel={matchLabel}
        match={
          matchAnalysis.state.status === 'ready'
            ? matchAnalysis.state.match
            : undefined
        }
        frame={
          matchAnalysis.state.status === 'ready'
            ? (matchAnalysis.state.frames.find(
                (item) => item.eventId === eventId,
              ) ?? null)
            : null
        }
        narrativeState={narrative.state}
        intelligenceState={intel}
        decisionUnavailable={decisionUnavailable}
        onAskAgents={
          analysis ? () => setAskedDecisionKey(decisionKey) : undefined
        }
        onNarrativeRetry={narrative.retry}
        onIntelRetry={intelligence.retry}
        onDecisionRetry={decisionUnavailable ? retry : undefined}
      />
    </div>
  )
}
