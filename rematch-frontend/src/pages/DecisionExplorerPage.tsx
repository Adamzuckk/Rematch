import { useParams } from 'react-router-dom'
import { DecisionExplorerPanel } from '../components/decision/DecisionExplorerPanel'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { useDecisionAnalysis } from '../hooks/useDecisionAnalysis'
import { useMatchSummary, formatMatchLabel } from '../hooks/useMatchSummary'
import { useLocale } from '../i18n/locale'
import styles from './DecisionExplorerPage.module.css'

export function DecisionExplorerPage() {
  const { matchId, eventId } = useParams()
  const { t } = useLocale()
  const { state, retry } = useDecisionAnalysis(matchId, eventId)
  const matchState = useMatchSummary(matchId)

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

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className={styles.page}>
        <p className={styles.loading} role="status" aria-live="polite">
          {t('decisionLoading')}
        </p>
      </div>
    )
  }

  if (state.status === 'not-found') {
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

  if (state.status === 'insufficient-evidence') {
    return (
      <div className={styles.page}>
        <div className={styles.toolbar}>
          <Button variant="ghost" to={backTo}>
            {t('decisionBackToMatch')}
          </Button>
        </div>
        <EmptyState
          title={t('decisionInsufficientTitle')}
          description={`${t('decisionInsufficientBody')} ${state.message}`}
          action={
            <Button variant="secondary" onClick={retry}>
              {t('decisionRetry')}
            </Button>
          }
        />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className={styles.page}>
        <div className={styles.toolbar}>
          <Button variant="ghost" to={backTo}>
            {t('decisionBackToMatch')}
          </Button>
        </div>
        <EmptyState
          title={t('decisionErrorTitle')}
          description={`${state.message} ${t('decisionNetworkHint')}`}
          action={
            state.retryable ? (
              <Button variant="secondary" onClick={retry}>
                {t('decisionRetry')}
              </Button>
            ) : undefined
          }
        />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Button variant="ghost" to={backTo}>
          {t('decisionBackToMatch')}
        </Button>
      </div>
      <DecisionExplorerPanel
        analysis={state.analysis}
        matchLabel={matchLabel}
      />
    </div>
  )
}
