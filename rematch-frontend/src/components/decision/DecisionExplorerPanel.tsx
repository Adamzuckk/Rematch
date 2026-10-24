import type {
  ActionScore,
  ConfidenceLevel,
  CompletenessLevel,
  DecisionAnalysis,
  DecisionClaim,
  RankingEntry,
  VerificationStatus,
} from '../../types'
import type { MatchFrame, MatchSummary } from '../../types'
import { useState } from 'react'
import type { DecisionNarrativeState } from '../../hooks/useDecisionNarrative'
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
            <li key={`${ref.kind}:${ref.id}`}>
              {ref.kind}:{ref.id}
              {ref.detail ? ` — ${ref.detail}` : ''}
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

export interface DecisionExplorerPanelProps {
  analysis: DecisionAnalysis
  matchLabel?: string
  match?: MatchSummary
  frame?: MatchFrame | null
  narrativeState?: DecisionNarrativeState
  onNarrativeRetry?: () => void
}

export function DecisionExplorerPanel({
  analysis,
  matchLabel,
  match,
  frame,
  narrativeState,
  onNarrativeRetry,
}: DecisionExplorerPanelProps) {
  const { locale, t } = useLocale()
  const [selection, setSelection] = useState<{
    analysisKey: string
    actionId: string
  } | null>(null)
  const analysisKey = `${analysis.matchId}:${analysis.eventId}`
  const selectedActionId = selection?.analysisKey === analysisKey ? selection.actionId : null
  const selectAction = (actionId: string | null) =>
    setSelection(actionId ? { analysisKey, actionId } : null)
  const eligibleAlternatives = analysis.alternatives.filter(
    (alt) => alt.kind === 'hypothetical_pass' && alt.start && alt.end && isValidPitchPoint(alt.start) && isValidPitchPoint(alt.end),
  )
  const selected =
    analysis.alternatives.find((alt) => alt.actionId === selectedActionId) ?? null
  const selectedOnPitch =
    selected &&
    eligibleAlternatives.some((alt) => alt.actionId === selected.actionId)
      ? selected
      : null
  const selectedRank = selected
    ? analysis.ranking.find((entry) => entry.actionId === selected.actionId)?.rank
    : null
  const observedRank = analysis.ranking.find((entry) => entry.actionId === analysis.observed.actionId)?.rank
  const selectedClaim = selected ? analysis.claims.find((claim) => claim.id === `claim-alt-score:${selected.actionId}`) : null
  const ranking = sortRanking(analysis.ranking)
  const isSynthetic = analysis.provenance === 'synthetic'
  const contextOutcome =
    typeof analysis.context.outcome === 'string'
      ? analysis.context.outcome
      : null
  const contextPlayer =
    typeof analysis.context.playerName === 'string'
      ? analysis.context.playerName
      : null
  const contextMinute =
    typeof analysis.context.minute === 'number'
      ? analysis.context.minute
      : null
  const isMockFixture = analysis.context.mockFixture === true

  const observedScore = formatScore(analysis.observed.compositeScore)
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

  return (
    <article className={styles.root} aria-labelledby="decision-explorer-title">
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 id="decision-explorer-title" className={styles.title}>
            {t('decisionTitle')}
          </h1>
          <div className={styles.meta}>
            <span
              className={`${styles.badge} ${isSynthetic ? styles.badgeSynthetic : ''}`}
            >
              {isSynthetic
                ? t('decisionProvenanceSynthetic')
                : t('decisionProvenanceApi')}
            </span>
            <span className={styles.badge}>
              {analysis.scoringMethodId}@{analysis.scoringMethodVersion}
            </span>
            <span className={styles.badge}>
              {t('decisionConfidenceHeading')}:{' '}
              {t(confidenceKey(analysis.confidence))}
            </span>
          </div>
        </div>
      </header>

      {isMockFixture || (isSynthetic && analysis.alternatives.length === 0) ? (
        <p className={styles.banner} role="note">
          {t('decisionMockBanner')}
        </p>
      ) : null}

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

      <section
        className={`${styles.panel} ${styles.pipelinePanel}`}
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
                      <dd className={styles.mono}>not_assessed</dd>
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
                <div className={styles.pipelineNarrativeLanguages}>
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
                      <h5 className={styles.pipelineHeadline}>
                        {narrative.headline}
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

      <div className={styles.grid}>
        <div className={styles.stack}>
          <section className={styles.panel} aria-labelledby="decision-context">
            <h2 id="decision-context" className={styles.panelTitle}>
              {t('decisionContextHeading')}
            </h2>
            <dl className={styles.dl}>
              <div className={styles.row}>
                <dt>{t('decisionFieldMatch')}</dt>
                <dd className={styles.mono}>
                  {matchLabel ?? analysis.matchId}
                </dd>
              </div>
              <div className={styles.row}>
                <dt>{t('decisionFieldEvent')}</dt>
                <dd className={styles.mono}>{analysis.eventId}</dd>
              </div>
              <div className={styles.row}>
                <dt>{t('decisionFieldType')}</dt>
                <dd className={styles.mono}>{analysis.eventType}</dd>
              </div>
              {contextMinute != null ? (
                <div className={styles.row}>
                  <dt>{t('decisionFieldMinute')}</dt>
                  <dd className={styles.mono}>{contextMinute}&apos;</dd>
                </div>
              ) : null}
              {contextPlayer ? (
                <div className={styles.row}>
                  <dt>{t('decisionFieldPlayer')}</dt>
                  <dd>{contextPlayer}</dd>
                </div>
              ) : null}
              {contextOutcome ? (
                <div className={styles.row}>
                  <dt>{t('decisionConceptOutcome')}</dt>
                  <dd className={styles.mono}>{contextOutcome}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className={styles.panel} aria-labelledby="decision-observed">
            <h2 id="decision-observed" className={styles.panelTitle}>
              {t('decisionObservedHeading')}
            </h2>
            <p className={styles.panelNote}>{analysis.observed.label}</p>
            <p className={styles.panelNote}>
              {t('decisionCompositeLabel')}:{' '}
              {observedScore != null ? (
                <span className={styles.score}>
                  {observedScore} {t('decisionUnitPitchPercent')}
                </span>
              ) : (
                <span className={styles.scoreMuted}>
                  {t('decisionMetricUnavailable')}
                </span>
              )}
            </p>
            {analysis.observed.start && analysis.observed.end ? (
              <dl className={styles.dl}>
                <div className={styles.row}>
                  <dt>{t('decisionFieldStart')}</dt>
                  <dd className={styles.mono}>
                    x {analysis.observed.start.x.toFixed(1)}, y{' '}
                    {analysis.observed.start.y.toFixed(1)}
                  </dd>
                </div>
                <div className={styles.row}>
                  <dt>{t('decisionFieldEnd')}</dt>
                  <dd className={styles.mono}>
                    x {analysis.observed.end.x.toFixed(1)}, y{' '}
                    {analysis.observed.end.y.toFixed(1)}
                  </dd>
                </div>
              </dl>
            ) : null}
            <h3 className={styles.panelTitle}>{t('decisionMetricsHeading')}</h3>
            <ActionMetrics action={analysis.observed} />
          </section>

          <section className={styles.panel} aria-labelledby="decision-scoring">
            <h2 id="decision-scoring" className={styles.panelTitle}>
              {t('decisionScoringHeading')}
            </h2>
            <p className={styles.panelNote}>{t('decisionScoringExplainer')}</p>
            <ul className={styles.assumptions}>
              {analysis.scoringAssumptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className={styles.panelNote}>{t('decisionUnavailableMetrics')}</p>
          </section>
        </div>

        <div className={styles.stack}>
          <section className={styles.panel} aria-labelledby="pick-your-pass">
            <h2 id="pick-your-pass" className={styles.panelTitle}>{t('pickPassHeading')}</h2>
            <p className={styles.panelNote}>{t('pickPassNote')}</p>
            {isMockFixture ? <p className={styles.banner} role="note">{t('pickPassSynthetic')}</p> : null}
            {eligibleAlternatives.length === 0 ? (
              <p className={styles.panelNote} role="status">
                {analysis.alternatives.length === 0 ? t('pickPassUnavailable') : t('pickPassMissingCoordinates')}
              </p>
            ) : (
              <>
                <label className={styles.panelNote} htmlFor="pick-pass-select">{t('pickPassSelect')}</label>
                <select id="pick-pass-select" value={selected?.actionId ?? ''} onChange={(event) => selectAction(event.target.value || null)}>
                  <option value="">{t('pickPassChoose')}</option>
                  {eligibleAlternatives.map((alt) => <option key={alt.actionId} value={alt.actionId}>{alt.label}</option>)}
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
                ) : <p className={styles.panelNote} role="status">{t('pickPassPitchUnavailable')}</p>}
              </>
            )}
            {selected ? (
              <div aria-live="polite" data-testid="pick-pass-result">
                <p className={styles.panelNote}>{t('pickPassHypothetical')}</p>
                <p className={styles.panelNote}>{t('decisionCompositeLabel')}: {formatScore(selected.compositeScore) ?? t('decisionMetricUnavailable')} {selected.compositeScore == null ? '' : t('decisionUnitPitchPercent')}</p>
                <p className={styles.panelNote}>{t('decisionRankLabel')}: {selectedRank == null ? t('decisionMetricUnavailable') : `#${selectedRank}`}</p>
                <p className={styles.panelNote}>{t('pickPassObservedRank')}: {observedRank == null ? t('decisionMetricUnavailable') : `#${observedRank}`}</p>
                <p className={styles.panelNote}>{t('pickPassObservedCompare')}: {observedScore ?? t('decisionMetricUnavailable')} {observedScore == null ? '' : t('decisionUnitPitchPercent')}</p>
                {selectedClaim ? <ul className={styles.claims}><ClaimCard claim={selectedClaim} /></ul> : <p className={styles.panelNote}>{t('pickPassNoClaim')}</p>}
                <button type="button" onClick={() => selectAction(null)}>{t('pickPassReset')}</button>
              </div>
            ) : null}
          </section>
          <section className={styles.panel} aria-labelledby="decision-ranking">
            <h2 id="decision-ranking" className={styles.panelTitle}>
              {t('decisionRankingHeading')}
            </h2>
            <p className={styles.panelNote}>{t('decisionRankingNote')}</p>
            {ranking.length === 0 ? (
              <p className={styles.panelNote} role="status">
                {t('decisionRankingEmpty')}
              </p>
            ) : (
              <ol className={styles.rankList}>
                {ranking.map((entry) => {
                  const score = formatScore(entry.compositeScore)
                  const observed = isObservedKind(entry.kind)
                  return (
                    <li
                      key={entry.actionId}
                      className={`${styles.rankItem} ${observed ? styles.rankItemObserved : ''}`}
                    >
                      <span className={styles.rankNum}>
                        {entry.rank != null
                          ? `#${entry.rank}`
                          : t('decisionMissing')}
                      </span>
                      <div className={styles.rankLabel}>
                        <span className={styles.rankLabelText}>
                          {entry.label}
                        </span>
                        <span className={styles.rankKind}>
                          {observed
                            ? t('decisionKindObserved')
                            : t('decisionKindHypothetical')}
                        </span>
                      </div>
                      <span className={styles.rankScore}>
                        {score != null
                          ? `${score} ${t('decisionUnitPitchPercent')}`
                          : t('decisionMetricUnavailable')}
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <section
            className={`${styles.panel} ${styles.whatIfPanel}`}
            aria-labelledby="decision-what-if"
          >
            <p className={styles.whatIfEyebrow}>{t('whatIfEyebrow')}</p>
            <h2 id="decision-what-if" className={styles.panelTitle}>
              {t('whatIfTitle')}
            </h2>
            <p className={styles.whatIfIntro}>{t('whatIfIntro')}</p>
            {analysis.alternatives.length === 0 ? (
              <p className={styles.panelNote}>{t('whatIfNoAlternatives')}</p>
            ) : (
              <>
                <label className={styles.panelNote} htmlFor="what-if-select">
                  {t('whatIfSelectLabel')}
                </label>
                <select
                  id="what-if-select"
                  value={selected?.actionId ?? ''}
                  onChange={(event) => selectAction(event.target.value || null)}
                >
                  <option value="">{t('whatIfSelectPlaceholder')}</option>
                  {analysis.alternatives.map((alt) => {
                    const rank = analysis.ranking.find(
                      (entry) => entry.actionId === alt.actionId,
                    )?.rank
                    const scoreLabel = formatScore(alt.compositeScore)
                    return (
                      <option key={alt.actionId} value={alt.actionId}>
                        {alt.label}
                        {rank != null ? ` · #${rank}` : ''}
                        {scoreLabel != null ? ` · ${scoreLabel}` : ''}
                      </option>
                    )
                  })}
                </select>
                {!selected ? (
                  <p className={styles.panelNote}>{t('whatIfNeedSelection')}</p>
                ) : (
                  <>
                    <div className={styles.whatIfGrid}>
                      <div
                        className={`${styles.whatIfCard} ${styles.whatIfCardObserved}`}
                      >
                        <h3>{t('whatIfObserved')}</h3>
                        <p className={styles.panelNote}>
                          {analysis.observed.label}
                        </p>
                        <div className={styles.whatIfMetric}>
                          <span>{t('whatIfRank')}</span>
                          <span>
                            {observedRank == null
                              ? t('decisionMetricUnavailable')
                              : `#${observedRank}`}
                          </span>
                        </div>
                        <div className={styles.whatIfMetric}>
                          <span>{t('whatIfScore')}</span>
                          <span>
                            {formatScore(analysis.observed.compositeScore) ??
                              t('decisionMetricUnavailable')}
                            {analysis.observed.compositeScore == null
                              ? ''
                              : ` ${t('decisionUnitPitchPercent')}`}
                          </span>
                        </div>
                      </div>
                      <div
                        className={`${styles.whatIfCard} ${styles.whatIfCardAlt}`}
                      >
                        <h3>{t('whatIfAlternative')}</h3>
                        <p className={styles.panelNote}>{selected.label}</p>
                        <div className={styles.whatIfMetric}>
                          <span>{t('whatIfRank')}</span>
                          <span>
                            {selectedRank == null
                              ? t('decisionMetricUnavailable')
                              : `#${selectedRank}`}
                          </span>
                        </div>
                        <div className={styles.whatIfMetric}>
                          <span>{t('whatIfScore')}</span>
                          <span>
                            {formatScore(selected.compositeScore) ??
                              t('decisionMetricUnavailable')}
                            {selected.compositeScore == null
                              ? ''
                              : ` ${t('decisionUnitPitchPercent')}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={styles.whatIfMetric}>
                      <span>{t('whatIfDeltaRank')}</span>
                      <span>
                        {observedRank != null && selectedRank != null
                          ? `${observedRank - selectedRank > 0 ? '+' : ''}${observedRank - selectedRank}`
                          : t('decisionMetricUnavailable')}
                      </span>
                    </div>
                    <div className={styles.whatIfMetric}>
                      <span>{t('whatIfDeltaScore')}</span>
                      <span>
                        {analysis.observed.compositeScore != null &&
                        selected.compositeScore != null
                          ? `${selected.compositeScore - analysis.observed.compositeScore > 0 ? '+' : ''}${formatScore(selected.compositeScore - analysis.observed.compositeScore)}`
                          : t('decisionMetricUnavailable')}
                      </span>
                    </div>
                    <p className={styles.whatIfVerdict}>
                      {observedRank != null && selectedRank != null
                        ? selectedRank < observedRank
                          ? t('whatIfHigher')
                          : selectedRank > observedRank
                            ? t('whatIfLower')
                            : t('whatIfSameRank')
                        : t('whatIfSameRank')}
                    </p>
                    {selectedClaim ? (
                      <>
                        <h3 className={styles.panelTitle}>
                          {t('whatIfClaimsHeading')}
                        </h3>
                        <ul className={styles.claims}>
                          <ClaimCard claim={selectedClaim} />
                        </ul>
                      </>
                    ) : null}
                  </>
                )}
                <div className={styles.whatIfActions}>
                  <Button
                    variant="secondary"
                    to={`/matches/${analysis.matchId}/decisions/${analysis.eventId}/pick-your-pass`}
                  >
                    {t('whatIfOpenPickPass')}
                  </Button>
                </div>
                <p className={styles.panelNote}>{t('whatIfNarrativeHint')}</p>
              </>
            )}
            <p className={styles.whatIfDisclaimer}>{t('whatIfDisclaimer')}</p>
          </section>

          <section
            className={styles.panel}
            aria-labelledby="decision-alternatives"
          >
            <h2 id="decision-alternatives" className={styles.panelTitle}>
              {t('decisionAlternativesHeading')}
            </h2>
            {analysis.alternatives.length === 0 ? (
              <p className={styles.panelNote} role="status">
                {t('decisionAlternativesEmpty')}
              </p>
            ) : (
              <ul className={styles.rankList}>
                {analysis.alternatives.map((alt) => {
                  const score = formatScore(alt.compositeScore)
                  return (
                    <li key={alt.actionId} className={styles.rankItem}>
                      <span className={styles.rankNum}>
                        {t('decisionAltBadge')}
                      </span>
                      <div className={styles.rankLabel}>
                        <span className={styles.rankLabelText}>{alt.label}</span>
                        <span className={styles.rankKind}>
                          {t('decisionKindHypothetical')}
                          {alt.targetPlayerId
                            ? ` · ${alt.targetPlayerId}`
                            : ''}
                        </span>
                      </div>
                      <span className={styles.rankScore}>
                        {score != null
                          ? `${score} ${t('decisionUnitPitchPercent')}`
                          : t('decisionMetricUnavailable')}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section
            className={styles.panel}
            aria-labelledby="decision-completeness"
          >
            <h2 id="decision-completeness" className={styles.panelTitle}>
              {t('decisionCompletenessHeading')}
            </h2>
            <dl className={styles.dl}>
              <div className={styles.row}>
                <dt>{t('decisionFieldLevel')}</dt>
                <dd>{t(completenessKey(analysis.completeness.level))}</dd>
              </div>
              <div className={styles.row}>
                <dt>{t('decisionHasCoordinates')}</dt>
                <dd>
                  {analysis.completeness.hasCoordinates
                    ? t('decisionYes')
                    : t('decisionNo')}
                </dd>
              </div>
              <div className={styles.row}>
                <dt>{t('decisionHasFrame')}</dt>
                <dd>
                  {analysis.completeness.hasAlignedFrame
                    ? t('decisionYes')
                    : t('decisionNo')}
                </dd>
              </div>
              <div className={styles.row}>
                <dt>{t('decisionAltCount')}</dt>
                <dd className={styles.mono}>
                  {analysis.completeness.alternativeCount}
                </dd>
              </div>
            </dl>
            {analysis.completeness.missing.length > 0 ? (
              <ul className={styles.limitList}>
                {analysis.completeness.missing.map((item) => (
                  <li key={item}>
                    {t('decisionMissing')}: {item}
                  </li>
                ))}
              </ul>
            ) : null}
            {analysis.completeness.notes.map((note) => (
              <p key={note} className={styles.panelNote}>
                {note}
              </p>
            ))}
          </section>

          <section className={styles.panel} aria-labelledby="decision-claims">
            <h2 id="decision-claims" className={styles.panelTitle}>
              {t('decisionClaimsHeading')}
            </h2>
            <ul className={styles.claims}>
              {analysis.claims.map((claim) => (
                <ClaimCard key={claim.id} claim={claim} />
              ))}
            </ul>
          </section>

          {narrativeState ? (
            <section className={styles.panel} aria-labelledby="decision-narrative">
              <h2 id="decision-narrative" className={styles.panelTitle}>
                {t('decisionNarrativeHeading')}
              </h2>
              {narrativeState.status === 'loading' ? (
                <p className={styles.panelNote} role="status">
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
                <div data-testid="decision-narrative-content">
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
                  <p className={styles.panelNote}>
                    {t('decisionNarrativeVerificationScope')}
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          <section
            className={styles.panel}
            aria-labelledby="decision-limitations"
          >
            <h2 id="decision-limitations" className={styles.panelTitle}>
              {t('decisionLimitationsHeading')}
            </h2>
            <ul className={styles.limitList}>
              {analysis.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </article>
  )
}
