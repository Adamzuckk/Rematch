import type {
  ActionScore,
  ConfidenceLevel,
  CompletenessLevel,
  DecisionAnalysis,
  DecisionClaim,
  RankingEntry,
  VerificationStatus,
} from '../../types'
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

export interface DecisionExplorerPanelProps {
  analysis: DecisionAnalysis
  matchLabel?: string
}

export function DecisionExplorerPanel({
  analysis,
  matchLabel,
}: DecisionExplorerPanelProps) {
  const { t } = useLocale()
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
