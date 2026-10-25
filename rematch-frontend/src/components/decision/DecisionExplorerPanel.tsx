import type {
  ActionScore,
  ConfidenceLevel,
  CompletenessLevel,
  DecisionAnalysis,
  DecisionClaim,
  EvidenceStatement,
  LocalizedNarrative,
  RankingEntry,
  VerificationStatus,
} from '../../types'
import type { MatchFrame, MatchSummary } from '../../types'
import { useState } from 'react'
import { usePersona } from '../../context/PersonaContext'
import type { DecisionNarrativeState } from '../../hooks/useDecisionNarrative'
import type { EventIntelligenceState } from '../../hooks/useEventIntelligence'
import { useAskCrew } from '../../hooks/useAskCrew'
import { FloatingAskChat } from '../chat/FloatingAskChat'
import { FootballPitch } from '../pitch/FootballPitch'
import { Button } from '../ui/Button'
import { isValidPitchPoint } from '../../types/coordinates'
import { useLocale } from '../../i18n/locale'
import type { MessageKey } from '../../i18n/strings'
import styles from './DecisionExplorer.module.css'

function formatScore(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null
  return value.toFixed(2)
}

function sortRanking(ranking: RankingEntry[]): RankingEntry[] {
  return [...ranking].sort((a, b) => {
    const ra = a.rank ?? Number.POSITIVE_INFINITY
    const rb = b.rank ?? Number.POSITIVE_INFINITY
    if (ra !== rb) return ra - rb
    return a.actionId.localeCompare(b.actionId)
  })
}

function confidenceKey(level: ConfidenceLevel): MessageKey {
  switch (level) {
    case 'high':
      return 'decisionConfidenceHigh'
    case 'medium':
      return 'decisionConfidenceMedium'
    case 'low':
      return 'decisionConfidenceLow'
    default:
      return 'decisionConfidenceNone'
  }
}

function completenessKey(level: CompletenessLevel): MessageKey {
  switch (level) {
    case 'complete':
      return 'decisionCompletenessComplete'
    case 'partial':
      return 'decisionCompletenessPartial'
    default:
      return 'decisionCompletenessInsufficient'
  }
}

function claimStatusLabel(
  status: VerificationStatus,
  t: (key: MessageKey) => string,
): string {
  switch (status) {
    case 'verified':
      return t('decisionClaimVerified')
    case 'partially_supported':
      return t('decisionClaimPartial')
    default:
      return t('decisionClaimUnsupported')
  }
}

function claimStatusClass(status: VerificationStatus): string {
  switch (status) {
    case 'verified':
      return styles.statusVerified ?? ''
    case 'partially_supported':
      return styles.statusPartial ?? ''
    default:
      return styles.statusUnsupported ?? ''
  }
}

function isObservedKind(kind: string): boolean {
  return kind.startsWith('observed_')
}

function ActionMetrics({ action }: { action: ActionScore }) {
  const { t } = useLocale()
  return (
    <ul className={styles.metrics} aria-label={t('decisionMetricsHeading')}>
      {action.metrics.map((metric) => (
        <li key={metric.name} className={styles.metricRow}>
          <span className={styles.metricName}>{metric.name}</span>
          <span className={styles.metricValue}>
            {metric.status === 'available' && metric.value != null
              ? `${formatScore(metric.value)} ${t('decisionUnitPitchPercent')}`
              : t('decisionMetricUnavailable')}
          </span>
        </li>
      ))}
    </ul>
  )
}

function ClaimCard({ claim }: { claim: DecisionClaim }) {
  const { t } = useLocale()
  const statusText = claimStatusLabel(claim.status, t)

  return (
    <li className={styles.claim}>
      <div className={styles.claimHeader}>
        <p className={styles.claimStatement}>{claim.statement}</p>
        <span
          className={`${styles.status} ${claimStatusClass(claim.status)}`}
          role="status"
          aria-label={statusText}
        >
          <span className={styles.statusIcon} aria-hidden="true" />
          {statusText}
        </span>
      </div>
      {claim.reason ? (
        <p className={styles.claimReason}>{claim.reason}</p>
      ) : null}
      {claim.evidence.length > 0 ? (
        <ul className={styles.evidenceList}>
          {claim.evidence.map((ref) => (
            <li
              key={`${ref.kind}:${ref.id}`}
              title={`${ref.kind}:${ref.id}${ref.detail ? ` — ${ref.detail}` : ''}`}
            >
              {ref.kind}:{ref.id}
            </li>
          ))}
        </ul>
      ) : null}
      {claim.limitations.length > 0 ? (
        <ul className={styles.limitList}>
          {claim.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function NarrativeAgentFallback({
  state,
  onRetry,
}: {
  state?: DecisionNarrativeState
  onRetry?: () => void
}) {
  const { t } = useLocale()

  if (state?.status === 'loading') {
    return (
      <p className={styles.panelNote} role="status">
        {t('decisionNarrativeLoading')}
      </p>
    )
  }
  if (state?.status === 'error') {
    return (
      <div>
        <p className={styles.panelNote} role="alert">
          {t('decisionNarrativeError')} {state.message}
        </p>
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            {t('decisionNarrativeRetry')}
          </Button>
        ) : null}
      </div>
    )
  }
  return (
    <p className={styles.panelNote} role="status">
      {t('decisionNarrativeUnavailable')}{' '}
      {state?.status === 'unavailable' ? state.message : ''}
    </p>
  )
}


function tierClass(tier: EvidenceStatement['tier']): string {
  switch (tier) {
    case 'fact':
      return styles.tierFact ?? ''
    case 'metric':
      return styles.tierMetric ?? ''
    case 'hypothesis':
      return styles.tierHypothesis ?? ''
    default:
      return styles.tierMissing ?? ''
  }
}

function tierLabel(
  tier: EvidenceStatement['tier'],
  t: (key: MessageKey) => string,
): string {
  switch (tier) {
    case 'fact':
      return t('decisionTierFact')
    case 'metric':
      return t('decisionTierMetric')
    case 'hypothesis':
      return t('decisionTierHypothesis')
    default:
      return t('decisionTierMissing')
  }
}

function BriefingList({
  title,
  items,
}: {
  title: string
  items: string[]
}) {
  if (items.length === 0) return null
  return (
    <div className={styles.briefingBlock}>
      <h3 className={styles.briefingBlockTitle}>{title}</h3>
      <ul className={styles.briefingList}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function MomentBriefing({
  narrative,
  statements,
  intelligenceState,
  onIntelRetry,
  locale,
}: {
  narrative: LocalizedNarrative | null
  statements: EvidenceStatement[]
  intelligenceState?: EventIntelligenceState
  onIntelRetry?: () => void
  locale: 'en' | 'ar'
}) {
  const { t } = useLocale()

  return (
    <section
      className={`${styles.panel} ${styles.briefingPanel}`}
      aria-labelledby="decision-moment-briefing"
      data-testid="decision-moment-briefing"
    >
      <div>
        <h2 id="decision-moment-briefing" className={styles.panelTitle}>
          {t('decisionBriefingHeading')}
        </h2>
        <p className={styles.panelNote}>{t('decisionBriefingIntro')}</p>
      </div>

      {intelligenceState?.status === 'loading' ? (
        <p className={styles.panelNote} role="status" aria-live="polite">
          {t('decisionIntelLoading')}
        </p>
      ) : null}

      {intelligenceState?.status === 'unavailable' ? (
        <div data-testid="decision-briefing-empty">
          <p className={styles.panelNote} role="status">
            {t('decisionIntelUnavailable')} {intelligenceState.message}
          </p>
          <p className={styles.panelNote} role="note">
            {t('decisionIntelEmptyHint')}
          </p>
        </div>
      ) : null}

      {intelligenceState?.status === 'error' ? (
        <div>
          <p className={styles.panelNote} role="alert">
            {t('decisionIntelError')} {intelligenceState.message}
          </p>
          {intelligenceState.retryable && onIntelRetry ? (
            <Button variant="secondary" onClick={onIntelRetry}>
              {t('decisionIntelRetry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {intelligenceState?.status === 'not-found' ? (
        <p className={styles.panelNote} role="status">
          {t('decisionIntelNotFound')} {intelligenceState.message}
        </p>
      ) : null}

      {intelligenceState?.status === 'ready' ? (
        <p className={styles.llmBadge} role="status">
          {intelligenceState.intelligence.llmConnected
            ? t('decisionLlmConnected')
            : t('decisionLlmDisconnected')}
        </p>
      ) : null}

      {narrative ? (
        <div className={styles.briefingGrid}>
          <h3 className={styles.briefingHeadline}>{narrative.headline}</h3>
          <BriefingList
            title={t('decisionWhatHappened')}
            items={
              narrative.whatHappened && narrative.whatHappened.length > 0
                ? narrative.whatHappened
                : narrative.keyObservations.slice(0, 3)
            }
          />
          <BriefingList
            title={t('decisionWhyItMattered')}
            items={
              narrative.whyItMattered && narrative.whyItMattered.length > 0
                ? narrative.whyItMattered
                : []
            }
          />
          <BriefingList
            title={t('decisionWhatCouldHaveHappened')}
            items={
              narrative.whatCouldHaveHappened &&
              narrative.whatCouldHaveHappened.length > 0
                ? narrative.whatCouldHaveHappened
                : []
            }
          />
        </div>
      ) : intelligenceState?.status === 'idle' || intelligenceState == null ? (
        <p className={styles.panelNote} role="status" data-testid="decision-briefing-empty">
          {t('decisionIntelEmptyHint')}
        </p>
      ) : null}

      {statements.length > 0 ? (
        <div className={styles.statementSection}>
          <h3 className={styles.briefingBlockTitle}>{t('decisionEvidenceTiers')}</h3>
          <ul className={styles.statementList} aria-label={t('decisionEvidenceTiers')}>
            {statements.map((statement) => {
              const text = locale === 'ar' ? statement.arabic : statement.english
              return (
                <li
                  key={`${statement.tier}:${text}`}
                  className={`${styles.statementItem} ${tierClass(statement.tier)}`}
                >
                  <span className={styles.tierChip}>{tierLabel(statement.tier, t)}</span>
                  <span>{text}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {intelligenceState?.status === 'ready' &&
      intelligenceState.intelligence.missingEvidence.length > 0 ? (
        <div>
          <h3 className={styles.briefingBlockTitle}>{t('decisionIntelMissing')}</h3>
          <ul className={styles.limitList}>
            {intelligenceState.intelligence.missingEvidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

export interface DecisionExplorerPanelProps {
  /** Present when geometric decision analysis succeeded for this event. */
  analysis?: DecisionAnalysis
  matchId?: string
  eventId?: string
  matchLabel?: string
  match?: MatchSummary
  frame?: MatchFrame | null
  narrativeState?: DecisionNarrativeState
  intelligenceState?: EventIntelligenceState
  decisionUnavailable?: {
    kind: 'insufficient-evidence' | 'error'
    message: string
    retryable: boolean
  } | null
  onAskAgents?: () => void
  onNarrativeRetry?: () => void
  onIntelRetry?: () => void
  onDecisionRetry?: () => void
}

export function DecisionExplorerPanel({
  analysis,
  matchId: matchIdProp,
  eventId: eventIdProp,
  matchLabel,
  match,
  frame,
  narrativeState,
  intelligenceState,
  decisionUnavailable = null,
  onAskAgents,
  onNarrativeRetry,
  onIntelRetry,
  onDecisionRetry,
}: DecisionExplorerPanelProps) {
  const { locale, t } = useLocale()
  const { mode: personaMode } = usePersona()
  const isFan = personaMode === 'fan'
  const isAnalyst = !isFan
  const resolvedMatchId = analysis?.matchId ?? matchIdProp ?? ''
  const resolvedEventId = analysis?.eventId ?? eventIdProp ?? ''
  const [selection, setSelection] = useState<{
    analysisKey: string
    actionId: string
  } | null>(null)
  const [showAllRanking, setShowAllRanking] = useState(false)
  const [showAllClaims, setShowAllClaims] = useState(false)
  const {
    state: askCrewState,
    ask: askCrew,
    retry: retryAskCrew,
    clear: clearAskCrew,
  } = useAskCrew(resolvedMatchId || undefined)
  const analysisKey = `${resolvedMatchId}:${resolvedEventId}`
  const selectedActionId = selection?.analysisKey === analysisKey ? selection.actionId : null
  const selectAction = (actionId: string | null) =>
    setSelection(actionId ? { analysisKey, actionId } : null)
  const eligibleAlternatives = (analysis?.alternatives ?? []).filter(
    (alt) => alt.kind === 'hypothetical_pass' && alt.start && alt.end && isValidPitchPoint(alt.start) && isValidPitchPoint(alt.end),
  )
  const selected =
    analysis?.alternatives.find((alt) => alt.actionId === selectedActionId) ?? null
  const selectedOnPitch =
    selected &&
    eligibleAlternatives.some((alt) => alt.actionId === selected.actionId)
      ? selected
      : null
  const selectedRank = selected
    ? analysis?.ranking.find((entry) => entry.actionId === selected.actionId)?.rank
    : null
  const observedRank = analysis
    ? analysis.ranking.find((entry) => entry.actionId === analysis.observed.actionId)?.rank
    : null
  const selectedClaim = selected
    ? analysis?.claims.find((claim) => claim.id === `claim-alt-score:${selected.actionId}`)
    : null
  const ranking = sortRanking(analysis?.ranking ?? [])
  const visibleRanking = showAllRanking ? ranking : ranking.slice(0, 5)
  const isSynthetic = analysis?.provenance === 'synthetic'
  const contextOutcome =
    analysis && typeof analysis.context.outcome === 'string'
      ? analysis.context.outcome
      : null
  const contextPlayer =
    analysis && typeof analysis.context.playerName === 'string'
      ? analysis.context.playerName
      : null
  const contextMinute =
    analysis && typeof analysis.context.minute === 'number'
      ? analysis.context.minute
      : null
  const eventLabelParts = [
    contextMinute != null ? `${contextMinute}'` : null,
    analysis?.eventType ?? null,
    contextPlayer,
  ].filter(Boolean)
  const eventLabel =
    eventLabelParts.length > 0
      ? eventLabelParts.join(' · ')
      : resolvedEventId || null
  const isMockFixture = analysis?.context.mockFixture === true

  const observedScore = formatScore(analysis?.observed.compositeScore)
  const localizedNarrative =
    narrativeState?.status === 'ready'
      ? locale === 'ar'
        ? narrativeState.response.narrative.arabic
        : narrativeState.response.narrative.english
      : null
  const bilingualNarrative =
    narrativeState?.status === 'ready'
      ? narrativeState.response.narrative
      : null
  const narrativeProvenance =
    narrativeState?.status === 'ready'
      ? narrativeState.response.provenance
      : null
  const verificationResults =
    narrativeState?.status === 'ready'
      ? narrativeState.response.verificationResults
      : null
  const verificationSummary = verificationResults
    ? {
        verified: verificationResults.filter(
          (result) => result.evidenceValidationStatus === 'verified',
        ).length,
        partiallySupported: verificationResults.filter(
          (result) => result.evidenceValidationStatus === 'partially_supported',
        ).length,
        unsupported: verificationResults.filter(
          (result) => result.evidenceValidationStatus === 'unsupported',
        ).length,
      }
    : null
  const topRank = ranking[0] ?? null
  const orchestratorStatusKey: MessageKey =
    narrativeState?.status === 'ready'
      ? 'decisionPipelineOrchestratorStatus'
      : narrativeState?.status === 'loading'
        ? 'decisionPipelineOrchestratorLoading'
        : 'decisionPipelineOrchestratorWaiting'

  const hasPartialNarrative =
    narrativeState?.status === 'ready' &&
    (narrativeState.response.analysis.completeness.level !== 'complete' ||
      narrativeState.response.verificationResults.some(
        (result) => result.evidenceValidationStatus !== 'verified',
      ))

  const briefingNarrative: LocalizedNarrative | null =
    intelligenceState?.status === 'ready'
      ? locale === 'ar'
        ? intelligenceState.intelligence.arabic
        : intelligenceState.intelligence.english
      : localizedNarrative
  const briefingStatements: EvidenceStatement[] =
    intelligenceState?.status === 'ready'
      ? intelligenceState.intelligence.statements
      : []

  return (
    <article
      className={styles.root}
      aria-labelledby="decision-explorer-title"
      data-testid={isFan ? 'decision-view-fan' : 'decision-view-analyst'}
    >
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 id="decision-explorer-title" className={styles.title}>
            {t('decisionTitle')}{' '}
            <span className={styles.titleAccent}>{t('decisionTitleAccent')}</span>
          </h1>
          <div className={styles.meta}>
            <span className={styles.badge}>
              {isFan
                ? t('decisionExplorerFanBadge')
                : t('decisionExplorerAnalystBadge')}
            </span>
            <span
              className={`${styles.badge} ${isSynthetic ? styles.badgeSynthetic : ''}`}
            >
              {isSynthetic
                ? t('decisionProvenanceSynthetic')
                : t('decisionProvenanceApi')}
            </span>
            {isAnalyst && analysis ? (
              <span className={styles.badge}>
                {analysis.scoringMethodId}@{analysis.scoringMethodVersion}
              </span>
            ) : null}
            {analysis ? (
              <span className={styles.badge}>
                {t('decisionConfidenceHeading')}:{' '}
                {t(confidenceKey(analysis.confidence))}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {isMockFixture ||
      (isSynthetic && (analysis?.alternatives.length ?? 0) === 0) ? (
        <p className={styles.banner} role="note">
          {t('decisionMockBanner')}
        </p>
      ) : null}

      {isAnalyst ? (
        <ul className={styles.concepts} aria-label={t('decisionConceptLegend')}>
          <li className={styles.concept}>
            <span
              className={`${styles.conceptDot} ${styles.dotMeasured}`}
              aria-hidden="true"
            />
            {t('decisionConceptMeasured')}
          </li>
          <li className={styles.concept}>
            <span
              className={`${styles.conceptDot} ${styles.dotClaim}`}
              aria-hidden="true"
            />
            {t('decisionConceptClaim')}
          </li>
          <li className={styles.concept}>
            <span
              className={`${styles.conceptDot} ${styles.dotCompare}`}
              aria-hidden="true"
            />
            {t('decisionConceptComparison')}
          </li>
          <li className={styles.concept}>
            <span
              className={`${styles.conceptDot} ${styles.dotOutcome}`}
              aria-hidden="true"
            />
            {t('decisionConceptOutcome')}
          </li>
        </ul>
      ) : null}

      <MomentBriefing
        narrative={briefingNarrative}
        statements={briefingStatements}
        intelligenceState={intelligenceState}
        onIntelRetry={onIntelRetry}
        locale={locale}
      />

      {isFan ? (
        <p className={styles.panelNote} role="note">
          {t('decisionFanPitchHint')}
        </p>
      ) : null}

      {!analysis ? (
        <section className={styles.panel} aria-labelledby="decision-unavailable">
          <h2 id="decision-unavailable" className={styles.panelTitle}>
            {t('decisionInsufficientTitle')}
          </h2>
          <p className={styles.panelNote} role="status">
            {t('decisionAnalysisUnavailable')}
            {decisionUnavailable ? ` ${decisionUnavailable.message}` : ''}
          </p>
          {decisionUnavailable?.retryable && onDecisionRetry ? (
            <Button variant="secondary" onClick={onDecisionRetry}>
              {t('decisionAnalysisRetry')}
            </Button>
          ) : null}
        </section>
      ) : null}

      {analysis && isAnalyst ? (
      <details
        className={`${styles.panel} ${styles.pipelinePanel}`}
        data-testid="decision-advanced-tools"
      >
        <summary className={styles.advancedSummary}>
          <span>
            <span className={styles.panelTitle}>{t('decisionAdvancedTools')}</span>
            <span className={styles.panelNote}>{t('decisionAdvancedToolsHint')}</span>
          </span>
        </summary>
      <section
        className={styles.pipelineInner}
        aria-labelledby="decision-multi-agent-pipeline"
      >
        <div className={styles.pipelineSummary}>
          <h2 className={styles.panelTitle}>
            {t('decisionPipelineSummaryHeading')}
          </h2>
          <p className={styles.panelNote}>
            {t('decisionPipelineSummary')}
          </p>
        </div>
        <div>
          <h2
            id="decision-multi-agent-pipeline"
            className={styles.panelTitle}
          >
            {t('decisionPipelineHeading')}
          </h2>
          <p className={styles.panelNote}>
            {t('decisionPipelineDescription')}
          </p>
        </div>
        <ol className={styles.pipelineGrid} aria-label={t('decisionPipelineSteps')}>
          <li className={styles.pipelineGridItem}>
            <section
              className={styles.pipelineCard}
              aria-labelledby="decision-agent-orchestrator"
            >
              <span className={styles.pipelineStep} aria-hidden="true">1</span>
              <p className={styles.pipelineRole}>
                {t('decisionPipelineOrchestratorRole')}
              </p>
              <h3 id="decision-agent-orchestrator" className={styles.panelTitle}>
                {t('decisionPipelineOrchestratorAgent')}
              </h3>
              <p className={styles.panelNote}>
                {t('decisionPipelineOrchestratorSummary')}
              </p>
              <p className={styles.pipelineStatus} role="status">
                {t(orchestratorStatusKey)}
              </p>
              <p className={styles.pipelineHandoff}>
                {t('decisionPipelineOrchestratorHandoff')}
              </p>
            </section>
          </li>
          <li className={styles.pipelineGridItem}>
            <section
              className={styles.pipelineCard}
              aria-labelledby="decision-agent-match-intelligence"
            >
              <span className={styles.pipelineStep} aria-hidden="true">2</span>
              <p className={styles.pipelineRole}>
                {t('decisionPipelineMatchRole')}
              </p>
              <h3
                id="decision-agent-match-intelligence"
                className={styles.panelTitle}
              >
                {t('decisionPipelineMatchAgent')}
              </h3>
              <dl className={styles.dl}>
                <div className={styles.row}>
                  <dt>{t('decisionCompositeLabel')}</dt>
                  <dd className={styles.mono}>
                    {observedScore == null
                      ? t('decisionMetricUnavailable')
                      : `${observedScore} ${t('decisionUnitPitchPercent')}`}
                  </dd>
                </div>
                <div className={styles.row}>
                  <dt>{t('decisionAltCount')}</dt>
                  <dd className={styles.mono}>{analysis.alternatives.length}</dd>
                </div>
                <div className={styles.row}>
                  <dt>{t('decisionPipelineTopRank')}</dt>
                  <dd>
                    {topRank
                      ? `${topRank.label} · ${formatScore(topRank.compositeScore) ?? t('decisionMetricUnavailable')}`
                      : t('decisionMetricUnavailable')}
                  </dd>
                </div>
                <div className={styles.row}>
                  <dt>{t('decisionPipelineScoringMethod')}</dt>
                  <dd className={styles.mono}>
                    {analysis.scoringMethodId}@{analysis.scoringMethodVersion}
                  </dd>
                </div>
              </dl>
              <p className={styles.panelNote}>
                {t('decisionPipelineMatchNote')}
              </p>
              <p className={styles.pipelineHandoff}>
                {t('decisionPipelineMatchHandoff')}
              </p>
            </section>
          </li>
          <li className={styles.pipelineGridItem}>
            <section
              className={styles.pipelineCard}
              aria-labelledby="decision-agent-verifier"
            >
              <span className={styles.pipelineStep} aria-hidden="true">3</span>
              <p className={styles.pipelineRole}>
                {t('decisionPipelineVerifierRole')}
              </p>
              <h3 id="decision-agent-verifier" className={styles.panelTitle}>
                {t('decisionPipelineVerifierAgent')}
              </h3>
              {verificationSummary ? (
                <>
                  <p className={styles.panelNote}>
                    {t('decisionPipelineEvidenceSummary')}
                  </p>
                  <dl className={styles.dl}>
                    <div className={styles.row}>
                      <dt>{t('decisionPipelineVerified')}</dt>
                      <dd className={styles.mono}>{verificationSummary.verified}</dd>
                    </div>
                    <div className={styles.row}>
                      <dt>{t('decisionPipelinePartiallySupported')}</dt>
                      <dd className={styles.mono}>
                        {verificationSummary.partiallySupported}
                      </dd>
                    </div>
                    <div className={styles.row}>
                      <dt>{t('decisionPipelineUnsupported')}</dt>
                      <dd className={styles.mono}>{verificationSummary.unsupported}</dd>
                    </div>
                    <div className={styles.row}>
                      <dt>{t('decisionPipelineClaimSupportStatus')}</dt>
                      <dd className={styles.mono}>
                        {t('decisionClaimSupportNotAssessed')}
                      </dd>
                    </div>
                  </dl>
                  <p className={styles.panelNote}>
                    {t('decisionPipelineVerifierNote')}
                  </p>
                </>
              ) : (
                <NarrativeAgentFallback
                  state={narrativeState}
                  onRetry={onNarrativeRetry}
                />
              )}
              <p className={styles.pipelineHandoff}>
                {t(
                  verificationSummary
                    ? 'decisionPipelineVerifierHandoff'
                    : 'decisionPipelineVerifierWaiting',
                )}
              </p>
            </section>
          </li>
          <li className={styles.pipelineGridItem}>
            <section
              className={styles.pipelineCard}
              aria-labelledby="decision-agent-narrator"
            >
              <span className={styles.pipelineStep} aria-hidden="true">4</span>
              <p className={styles.pipelineRole}>
                {t('decisionPipelineNarratorRole')}
              </p>
              <h3 id="decision-agent-narrator" className={styles.panelTitle}>
                {t('decisionPipelineNarratorAgent')}
              </h3>
              {bilingualNarrative ? (
              <div
                className={styles.pipelineNarrativeLanguages}
                data-testid="decision-narrative-content"
              >
                  <p className={styles.panelNote}>
                    {t('decisionNarrativeProvenance')}: {narrativeProvenance === 'synthetic'
                      ? t('decisionProvenanceSynthetic')
                      : t('decisionProvenanceApi')}
                  </p>
                  {([
                    ['en', t('decisionPipelineEnglish'), bilingualNarrative.english],
                    ['ar', t('decisionPipelineArabic'), bilingualNarrative.arabic],
                  ] as const).map(([language, languageLabel, narrative]) => (
                    <div
                      className={styles.pipelineLanguageBlock}
                      key={language}
                      lang={language}
                      dir={language === 'ar' ? 'rtl' : 'ltr'}
                    >
                      <h4 className={styles.pipelineLanguageLabel}>
                        {languageLabel}
                      </h4>
                      <h5
                        className={styles.pipelineHeadline}
                        dir={language === 'ar' ? 'rtl' : 'ltr'}
                      >
                        <bdi dir="auto">{narrative.headline}</bdi>
                      </h5>
                      <h6 className={styles.pipelineSubheading}>
                        {t('decisionPipelineKeyPoints')}
                      </h6>
                      <ul className={styles.limitList}>
                        {narrative.keyObservations.slice(0, 3).map((observation) => (
                          <li key={observation}>{observation}</li>
                        ))}
                      </ul>
                      <h6 className={styles.pipelineSubheading}>
                        {t('decisionPipelineLimitation')}
                      </h6>
                      <ul className={styles.limitList}>
                        {narrative.limitations.slice(0, 1).map((limitation) => (
                          <li key={limitation}>{limitation}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <NarrativeAgentFallback
                  state={narrativeState}
                  onRetry={onNarrativeRetry}
                />
              )}
              <p className={styles.panelNote}>
                {t('decisionPipelineNarratorNote')}
              </p>
              <p className={styles.pipelineHandoff}>
                {t(
                  localizedNarrative
                    ? 'decisionPipelineNarratorHandoff'
                    : 'decisionPipelineNarratorWaiting',
                )}
              </p>
            </section>
          </li>
        </ol>
        <p className={styles.pipelineFooter}>
          {t('decisionPipelineFooter')}
        </p>
      </section>
      </details>
      ) : null}

      {analysis ? (
      <div className={styles.decisionLayout}>
        <div className={styles.summaryRow}>
          <section
            className={`${styles.panel} ${styles.compactPanel}`}
            aria-labelledby="decision-context"
          >
            <h2 id="decision-context" className={styles.panelTitle}>
              {t('decisionContextHeading')}
            </h2>
            <dl className={styles.compactFacts}>
              <div><dt>{t('decisionFieldMatch')}</dt><dd title={matchLabel ?? analysis.matchId}>{matchLabel ?? analysis.matchId}</dd></div>
              <div><dt>{t('decisionFieldEvent')}</dt><dd title={analysis.eventId}>{analysis.eventId}</dd></div>
              <div><dt>{t('decisionFieldType')}</dt><dd>{analysis.eventType}</dd></div>
              {contextMinute != null ? <div><dt>{t('decisionFieldMinute')}</dt><dd>{contextMinute}&apos;</dd></div> : null}
              {contextPlayer ? <div><dt>{t('decisionFieldPlayer')}</dt><dd>{contextPlayer}</dd></div> : null}
              {contextOutcome ? <div><dt>{t('decisionConceptOutcome')}</dt><dd>{contextOutcome}</dd></div> : null}
            </dl>
          </section>

          <section
            className={`${styles.panel} ${styles.compactPanel}`}
            aria-labelledby="decision-observed"
          >
            <h2 id="decision-observed" className={styles.panelTitle}>
              {t('decisionObservedHeading')}
            </h2>
            <p className={styles.observedLabel}>{analysis.observed.label}</p>
            <div className={styles.summaryMetrics}>
              <div className={styles.summaryMetric}>
                <span>{t('decisionCompositeLabel')}</span>
                <strong className={styles.mono}>
                  {observedScore == null ? t('decisionMetricUnavailable') : `${observedScore} ${t('decisionUnitPitchPercent')}`}
                </strong>
              </div>
              <div className={styles.summaryMetric}>
                <span>{t('decisionRankLabel')}</span>
                <strong className={styles.mono}>{observedRank == null ? t('decisionMetricUnavailable') : `#${observedRank}`}</strong>
              </div>
            </div>
            <details className={styles.inlineDisclosure}>
              <summary>{t('decisionMetricsHeading')}</summary>
              <ActionMetrics action={analysis.observed} />
              {analysis.observed.start && analysis.observed.end ? (
                <dl className={styles.dl}>
                  <div className={styles.row}>
                    <dt>{t('decisionFieldStart')}</dt>
                    <dd className={styles.mono}>x {analysis.observed.start.x.toFixed(1)}, y {analysis.observed.start.y.toFixed(1)}</dd>
                  </div>
                  <div className={styles.row}>
                    <dt>{t('decisionFieldEnd')}</dt>
                    <dd className={styles.mono}>x {analysis.observed.end.x.toFixed(1)}, y {analysis.observed.end.y.toFixed(1)}</dd>
                  </div>
                </dl>
              ) : null}
            </details>
          </section>
        </div>

        <div className={styles.analysisRow}>
          <section
            className={`${styles.panel} ${styles.pickPanel}`}
            aria-labelledby="pick-your-pass"
          >
            <div>
              <h2 id="pick-your-pass" className={styles.panelTitle}>{t('pickPassHeading')}</h2>
              <p className={styles.panelNote}>{t('pickPassNote')}</p>
            </div>
            {isMockFixture ? <p className={styles.banner} role="note">{t('pickPassSynthetic')}</p> : null}
            {eligibleAlternatives.length === 0 ? (
              <p className={styles.panelNote} role="status">
                {analysis.alternatives.length === 0 ? t('pickPassUnavailable') : t('pickPassMissingCoordinates')}
              </p>
            ) : (
              <>
                <label className={styles.panelNote} htmlFor="pick-pass-select">{t('pickPassSelect')}</label>
                <select
                  id="pick-pass-select"
                  value={selected?.actionId ?? ''}
                  onChange={(event) => selectAction(event.target.value || null)}
                >
                  <option value="">{t('pickPassChoose')}</option>
                  {eligibleAlternatives.map((alt) => (
                    <option key={alt.actionId} value={alt.actionId}>{alt.label}</option>
                  ))}
                </select>
                {match && frame ? (
                  <FootballPitch
                    homeTeam={match.homeTeam}
                    awayTeam={match.awayTeam}
                    frame={frame}
                    label={t('pickPassPitch')}
                    locale={locale}
                    highlightedPath={selectedOnPitch ? { start: selectedOnPitch.start!, end: selectedOnPitch.end! } : null}
                    selectablePlayerIds={eligibleAlternatives.map((alt) => alt.targetPlayerId).filter((id): id is string => Boolean(id))}
                    selectedPlayerId={selectedOnPitch?.targetPlayerId}
                    selectPlayerLabel={(playerId) => `${t('pickPassSelectPlayer')} ${playerId}`}
                    onSelectPlayer={(playerId) => {
                      const target = eligibleAlternatives.find((alt) => alt.targetPlayerId === playerId)
                      selectAction(target?.actionId ?? null)
                    }}
                  />
                ) : (
                  <p className={styles.panelNote} role="status">{t('pickPassPitchUnavailable')}</p>
                )}
              </>
            )}
            {selected ? (
              <div className={styles.selectionResult} aria-live="polite" data-testid="pick-pass-result">
                <p className={styles.panelNote}>{t('pickPassHypothetical')}</p>
                <div className={styles.summaryMetrics}>
                  <div className={styles.summaryMetric}>
                    <span>{t('decisionCompositeLabel')}</span>
                    <strong className={styles.mono}>{formatScore(selected.compositeScore) ?? t('decisionMetricUnavailable')} {selected.compositeScore == null ? '' : t('decisionUnitPitchPercent')}</strong>
                  </div>
                  <div className={styles.summaryMetric}>
                    <span>{t('decisionRankLabel')}</span>
                    <strong className={styles.mono}>{selectedRank == null ? t('decisionMetricUnavailable') : `#${selectedRank}`}</strong>
                  </div>
                </div>
                <p className={styles.panelNote}>{t('pickPassObservedCompare')}: {observedScore ?? t('decisionMetricUnavailable')} {observedScore == null ? '' : t('decisionUnitPitchPercent')} · {t('pickPassObservedRank')}: {observedRank == null ? t('decisionMetricUnavailable') : `#${observedRank}`}</p>
                {selectedClaim ? <p className={styles.selectionClaim}>{selectedClaim.statement}</p> : null}
                <details className={styles.inlineDisclosure}>
                  <summary>{t('whatIfTitle')}</summary>
                  <p className={styles.panelNote}>{t('whatIfIntro')}</p>
                  <dl className={styles.compactFacts}>
                    <div><dt>{t('whatIfDeltaRank')}</dt><dd>{observedRank != null && selectedRank != null ? `${observedRank - selectedRank > 0 ? '+' : ''}${observedRank - selectedRank}` : t('decisionMetricUnavailable')}</dd></div>
                    <div><dt>{t('whatIfDeltaScore')}</dt><dd>{analysis.observed.compositeScore != null && selected.compositeScore != null ? `${selected.compositeScore - analysis.observed.compositeScore > 0 ? '+' : ''}${formatScore(selected.compositeScore - analysis.observed.compositeScore)}` : t('decisionMetricUnavailable')}</dd></div>
                  </dl>
                  <p className={styles.whatIfVerdict}>
                    {observedRank != null && selectedRank != null
                      ? selectedRank < observedRank
                        ? t('whatIfHigher')
                        : selectedRank > observedRank
                          ? t('whatIfLower')
                          : t('whatIfSameRank')
                      : t('whatIfSameRank')}
                  </p>
                  <p className={styles.whatIfDisclaimer}>{t('whatIfDisclaimer')}</p>
                </details>
                <button type="button" onClick={() => selectAction(null)}>{t('pickPassReset')}</button>
              </div>
            ) : null}
          </section>

          {isAnalyst ? (
          <details
            className={`${styles.panel} ${styles.rankingPanel}`}
            data-testid="decision-ranking-disclosure"
          >
            <summary className={styles.advancedSummary}>
              <span>
                <h2 id="decision-ranking" className={styles.panelTitle}>
                  {t('decisionRankingHeading')}
                </h2>
                <span className={styles.panelNote}>{t('decisionRankingToolsHint')}</span>
              </span>
            </summary>
            <p className={styles.panelNote}>{t('decisionRankingNote')}</p>
            {ranking.length === 0 ? (
              <p className={styles.panelNote} role="status">{t('decisionRankingEmpty')}</p>
            ) : (
              <>
                <ol className={styles.rankList}>
                  {visibleRanking.map((entry) => {
                    const score = formatScore(entry.compositeScore)
                    const observed = isObservedKind(entry.kind)
                    return (
                      <li key={entry.actionId} className={`${styles.rankItem} ${observed ? styles.rankItemObserved : ''}`}>
                        <span className={styles.rankNum}>{entry.rank != null ? `#${entry.rank}` : t('decisionMissing')}</span>
                        <div className={styles.rankLabel}>
                          <span className={styles.rankLabelText}>{entry.label}</span>
                          <span className={styles.rankKind}>{observed ? t('decisionKindObserved') : t('decisionKindHypothetical')}</span>
                        </div>
                        <span className={styles.rankScore} title={score ?? t('decisionMetricUnavailable')}>{score != null ? `${score} ${t('decisionUnitPitchPercent')}` : t('decisionMetricUnavailable')}</span>
                      </li>
                    )
                  })}
                </ol>
                {ranking.length > 5 ? (
                  <button
                    type="button"
                    className={styles.inlineToggle}
                    aria-expanded={showAllRanking}
                    onClick={() => setShowAllRanking((value) => !value)}
                  >
                    {t(showAllRanking ? 'decisionShowLess' : 'decisionShowAll')}
                  </button>
                ) : null}
              </>
            )}
          </details>
          ) : null}
        </div>

        {isAnalyst ? (
        <div className={styles.detailsGrid}>
          <details className={styles.disclosurePanel}>
            <summary><span className={styles.panelTitle}>{t('decisionScoringHeading')}</span></summary>
            <p className={styles.panelNote}>{t('decisionScoringExplainer')}</p>
            <ul className={styles.assumptions}>
              {analysis.scoringAssumptions.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className={styles.panelNote}>{t('decisionUnavailableMetrics')}</p>
          </details>

          <details className={styles.disclosurePanel}>
            <summary><span className={styles.panelTitle}>{t('decisionCompletenessHeading')}</span></summary>
            <dl className={styles.dl}>
              <div className={styles.row}><dt>{t('decisionFieldLevel')}</dt><dd>{t(completenessKey(analysis.completeness.level))}</dd></div>
              <div className={styles.row}><dt>{t('decisionHasCoordinates')}</dt><dd>{analysis.completeness.hasCoordinates ? t('decisionYes') : t('decisionNo')}</dd></div>
              <div className={styles.row}><dt>{t('decisionHasFrame')}</dt><dd>{analysis.completeness.hasAlignedFrame ? t('decisionYes') : t('decisionNo')}</dd></div>
              <div className={styles.row}><dt>{t('decisionAltCount')}</dt><dd className={styles.mono}>{analysis.completeness.alternativeCount}</dd></div>
            </dl>
            {analysis.completeness.missing.length > 0 ? (
              <ul className={styles.limitList}>
                {analysis.completeness.missing.map((item) => <li key={item}>{t('decisionMissing')}: {item}</li>)}
              </ul>
            ) : null}
            {analysis.completeness.notes.map((note) => <p key={note} className={styles.panelNote}>{note}</p>)}
          </details>

          <details className={styles.disclosurePanel}>
            <summary>
              <span className={styles.panelTitle}>{t('decisionClaimsHeading')}</span>
              <span className={styles.disclosureCount}>{analysis.claims.length}</span>
            </summary>
            {analysis.claims.length > 0 ? (
              <>
                <ul className={styles.claims}>
                  {analysis.claims.slice(0, showAllClaims ? analysis.claims.length : 3).map((claim) => (
                    <ClaimCard key={claim.id} claim={claim} />
                  ))}
                </ul>
                {analysis.claims.length > 3 ? (
                  <button
                    type="button"
                    className={styles.inlineToggle}
                    aria-expanded={showAllClaims}
                    onClick={() => setShowAllClaims((value) => !value)}
                  >
                    {t(showAllClaims ? 'decisionShowLess' : 'decisionShowAllClaims')}
                  </button>
                ) : null}
              </>
            ) : (
              <p className={styles.panelNote} role="status">{t('decisionNoClaims')}</p>
            )}
          </details>

        </div>
        ) : null}

          {isAnalyst && narrativeState ? (
            <details
              className={`${styles.panel} ${styles.askAgentsPanel}`}
              data-testid="decision-ask-agents-disclosure"
            >
              <summary className={styles.advancedSummary}>
                <span>
                  <h2 id="ask-agents-narrative" className={styles.panelTitle}>
                    {t('askAgentsHeading')}
                  </h2>
                  <span className={styles.panelNote}>{t('decisionAskAgentsHint')}</span>
                </span>
              </summary>
              <p className={styles.panelNote}>{t('askAgentsDescription')}</p>
              {narrativeState.status === 'idle' && onAskAgents ? (
                <Button variant="secondary" onClick={onAskAgents}>
                  {t('askAgentsAction')}
                </Button>
              ) : null}
              {narrativeState.status === 'loading' ? (
                <p className={styles.panelNote} role="status" aria-live="polite">
                  {t('decisionNarrativeLoading')}
                </p>
              ) : null}
              {narrativeState.status === 'unavailable' ? (
                <p className={styles.panelNote} role="status">
                  {t('decisionNarrativeUnavailable')} {narrativeState.message}
                </p>
              ) : null}
              {narrativeState.status === 'error' ? (
                <div>
                  <p className={styles.panelNote} role="alert">
                    {t('decisionNarrativeError')} {narrativeState.message}
                  </p>
                  {onNarrativeRetry ? (
                    <Button variant="secondary" onClick={onNarrativeRetry}>
                      {t('decisionNarrativeRetry')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {localizedNarrative ? (
                <div data-testid="ask-agents-narrative-content">
                  {hasPartialNarrative ? (
                    <p className={styles.panelNote} role="status">
                      {t('askAgentsPartial')}
                    </p>
                  ) : null}
                  <p className={styles.panelNote}>
                    {t('decisionNarrativeProvenance')}: {narrativeProvenance === 'synthetic'
                      ? t('decisionProvenanceSynthetic')
                      : t('decisionProvenanceApi')}
                  </p>
                  <h3 className={styles.panelTitle}>{localizedNarrative.headline}</h3>
                  <h4 className={styles.panelTitle}>{t('decisionNarrativeObservations')}</h4>
                  <ul className={styles.limitList}>
                    {localizedNarrative.keyObservations.map((observation) => (
                      <li key={observation}>{observation}</li>
                    ))}
                  </ul>
                  <h4 className={styles.panelTitle}>{t('decisionLimitationsHeading')}</h4>
                  <ul className={styles.limitList}>
                    {localizedNarrative.limitations.map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                  {narrativeState.status === 'ready' &&
                  narrativeState.response.verificationResults.length > 0 ? (
                    <>
                      <h4 className={styles.panelTitle}>
                        {t('askAgentsValidationHeading')}
                      </h4>
                      <ul className={styles.limitList}>
                        {narrativeState.response.verificationResults.map((result) => (
                          <li key={result.claimId}>
                            {result.claimId}: {claimStatusLabel(result.evidenceValidationStatus, t)}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  <p className={styles.panelNote}>
                    {t('askAgentsTruthScope')}
                  </p>
                </div>
              ) : null}
            </details>
          ) : null}

          {isAnalyst ? (
          <details className={styles.disclosurePanel}>
            <summary><span className={styles.panelTitle}>{t('decisionLimitationsHeading')}</span></summary>
            <ul className={styles.limitList}>
              {analysis.limitations.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </details>
          ) : null}
      </div>
      ) : null}
      {resolvedMatchId ? (
        <FloatingAskChat
          variant={isFan ? 'agent' : 'analyst'}
          matchId={resolvedMatchId}
          eventId={resolvedEventId || null}
          eventLabel={eventLabel}
          match={match}
          analysis={analysis}
          narrativeState={narrativeState}
          askCrewState={askCrewState}
          onAskQuestion={(question) => {
            void askCrew({
              question,
              eventId: resolvedEventId || null,
              language: locale,
            })
          }}
          onAskRetry={() => {
            void retryAskCrew(resolvedEventId || null, locale)
          }}
          onClearAsk={clearAskCrew}
        />
      ) : null}
    </article>
  )
}
