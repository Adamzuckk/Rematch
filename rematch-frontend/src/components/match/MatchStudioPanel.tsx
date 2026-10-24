import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import type { DecisionNarrativeResponse, MatchEvent, Player, Team } from '../../types'
import type { DecisionNarrativeState } from '../../hooks/useDecisionNarrative'
import {
  buildAskSuggestions,
  buildLocalFactsAnswer,
  filterAskSuggestions,
  matchSuggestionByTitle,
  type AskLocalFactsAnswer,
  type AskSuggestion,
  type AskSuggestionFilter,
} from '../../lib/askCrew'
import { formatEventMinute, isDecisionCandidate } from '../../lib/pitch'
import { useLocale } from '../../i18n/locale'
import { Button } from '../ui/Button'
import { eventTypeLabel } from './eventLabels'
import styles from './MatchStudioPanel.module.css'

export type MatchStudioTab = 'live' | 'ask'

export interface MatchStudioPanelProps {
  matchId: string
  events: readonly MatchEvent[]
  selectedEventId: string | null
  selectedEvent: MatchEvent | null
  homeTeam: Team
  awayTeam: Team
  players: readonly Player[]
  canPrevious: boolean
  canNext: boolean
  onSelectEvent: (eventId: string) => void
  onPrevious: () => void
  onNext: () => void
  onOpenDecision: (eventId: string) => void
  onDownloadReport: () => void
  narrativeState: DecisionNarrativeState
  onAskSelectedEvent: () => void
  onNarrativeRetry: () => void
  /** Clears the page-owned narrative enablement (ASK answer). */
  onClearAsk?: () => void
  /** Narratives already returned for events (LIVE shows headlines only when present). */
  narrativeByEventId?: Readonly<Record<string, DecisionNarrativeResponse>>
  /** Compact chrome for Fan View side panel. */
  compact?: boolean
  /** Initial studio tab. */
  defaultTab?: MatchStudioTab
}

type AskPanelOutcome =
  | { kind: 'none' }
  | { kind: 'unsupported'; messageKey: 'matchStudioAskUnsupported' | 'askCrewUnavailableNeedsAskApi' }
  | { kind: 'local_facts'; answer: AskLocalFactsAnswer; eventId: string }
  | { kind: 'suggestion_unavailable'; reasonKey: NonNullable<AskSuggestion['unavailableReasonKey']> }

function resolveTeamName(
  teamId: string | undefined,
  homeTeam: Team,
  awayTeam: Team,
): string | null {
  if (!teamId) return null
  if (teamId === homeTeam.id) return homeTeam.name
  if (teamId === awayTeam.id) return awayTeam.name
  return null
}

function resolvePlayerName(
  playerId: string | undefined,
  players: readonly Player[],
): string | null {
  if (!playerId) return null
  return players.find((player) => player.id === playerId)?.name ?? null
}

function verificationLabel(
  status: string,
  t: ReturnType<typeof useLocale>['t'],
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

const ASK_FILTERS: AskSuggestionFilter[] = [
  'all',
  'goals',
  'decisions',
  'passing',
  'tactics',
]

export function MatchStudioPanel({
  matchId,
  events,
  selectedEventId,
  selectedEvent,
  homeTeam,
  awayTeam,
  players,
  canPrevious,
  canNext,
  onSelectEvent,
  onPrevious,
  onNext,
  onOpenDecision,
  onDownloadReport,
  narrativeState,
  onAskSelectedEvent,
  onNarrativeRetry,
  onClearAsk,
  narrativeByEventId = {},
  compact = false,
  defaultTab = 'live',
}: MatchStudioPanelProps) {
  const { t, locale } = useLocale()
  const [tab, setTab] = useState<MatchStudioTab>(defaultTab)
  const [draftQuestion, setDraftQuestion] = useState('')
  const [askFilter, setAskFilter] = useState<AskSuggestionFilter>('all')
  const [askOutcome, setAskOutcome] = useState<AskPanelOutcome>({ kind: 'none' })
  const baseId = useId()
  const liveTabId = `${baseId}-live-tab`
  const askTabId = `${baseId}-ask-tab`
  const livePanelId = `${baseId}-live-panel`
  const askPanelId = `${baseId}-ask-panel`
  const questionInputId = `${baseId}-question`
  const selectedRef = useRef<HTMLButtonElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (tab !== 'live') return
    const node = selectedRef.current
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedEventId, tab])

  const decisionSelected =
    selectedEvent != null && isDecisionCandidate(selectedEvent)

  const suggestions = useMemo(
    () => buildAskSuggestions({ selectedEvent }),
    [selectedEvent],
  )
  const visibleSuggestions = useMemo(
    () => filterAskSuggestions(suggestions, askFilter),
    [suggestions, askFilter],
  )

  const localizedNarrative =
    narrativeState.status === 'ready'
      ? locale === 'ar'
        ? narrativeState.response.narrative.arabic
        : narrativeState.response.narrative.english
      : null

  const hasPartialNarrative =
    narrativeState.status === 'ready' &&
    (narrativeState.response.analysis.completeness.level !== 'complete' ||
      narrativeState.response.verificationResults.some(
        (result) => result.evidenceValidationStatus !== 'verified',
      ))

  const showNarrativeAnswer =
    narrativeState.status === 'ready' ||
    narrativeState.status === 'loading' ||
    narrativeState.status === 'unavailable' ||
    narrativeState.status === 'error'

  const hasAnswerSurface =
    askOutcome.kind !== 'none' ||
    showNarrativeAnswer ||
    (selectedEvent != null && !decisionSelected && askOutcome.kind === 'none')

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next: MatchStudioTab =
      (locale === 'ar' ? event.key === 'ArrowLeft' : event.key === 'ArrowRight')
        ? tab === 'live'
          ? 'ask'
          : 'live'
        : tab === 'ask'
          ? 'live'
          : 'ask'
    setTab(next)
  }

  const clearAskPanel = () => {
    setDraftQuestion('')
    setAskOutcome({ kind: 'none' })
    onClearAsk?.()
  }

  const runSuggestion = (suggestion: AskSuggestion) => {
    setDraftQuestion(t(suggestion.titleKey))
    if (suggestion.unavailable) {
      setAskOutcome({
        kind: 'suggestion_unavailable',
        reasonKey:
          suggestion.unavailableReasonKey ?? 'askCrewUnavailableNeedsAskApi',
      })
      return
    }

    switch (suggestion.action) {
      case 'narrative':
        setAskOutcome({ kind: 'none' })
        onAskSelectedEvent()
        break
      case 'whatif':
        if (selectedEvent) {
          setAskOutcome({ kind: 'none' })
          onOpenDecision(selectedEvent.id)
        }
        break
      case 'local_facts':
        if (selectedEvent) {
          setAskOutcome({
            kind: 'local_facts',
            eventId: selectedEvent.id,
            answer: buildLocalFactsAnswer({
              event: selectedEvent,
              homeTeam,
              awayTeam,
              players,
            }),
          })
        }
        break
      case 'unsupported':
        setAskOutcome({
          kind: 'unsupported',
          messageKey: 'askCrewUnavailableNeedsAskApi',
        })
        break
    }
  }

  const submitComposer = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = draftQuestion.trim()
    if (!trimmed) {
      if (decisionSelected) {
        setAskOutcome({ kind: 'none' })
        onAskSelectedEvent()
      }
      return
    }

    const matched = matchSuggestionByTitle(trimmed, suggestions, (key) => t(key))
    if (matched) {
      runSuggestion(matched)
      return
    }

    setAskOutcome({
      kind: 'unsupported',
      messageKey: 'matchStudioAskUnsupported',
    })
  }

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    const form = event.currentTarget.form
    if (form) form.requestSubmit()
  }

  const filterLabel = (filter: AskSuggestionFilter): string => {
    switch (filter) {
      case 'goals':
        return t('askCrewFilterGoals')
      case 'decisions':
        return t('askCrewFilterDecisions')
      case 'passing':
        return t('askCrewFilterPassing')
      case 'tactics':
        return t('askCrewFilterTactics')
      default:
        return t('askCrewFilterAll')
    }
  }

  return (
    <section
      className={[styles.root, compact ? styles.compact : ''].filter(Boolean).join(' ')}
      aria-label={t('matchStudioLabel')}
      data-testid="match-studio-panel"
      data-compact={compact ? 'true' : undefined}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>{t('matchStudioTitle')}</h2>
        <div
          className={styles.tabList}
          role="tablist"
          aria-label={t('matchStudioTabs')}
          onKeyDown={onTabKeyDown}
        >
          <button
            type="button"
            role="tab"
            id={liveTabId}
            className={[styles.tab, tab === 'live' ? styles.tabActive : '']
              .filter(Boolean)
              .join(' ')}
            aria-selected={tab === 'live'}
            aria-controls={livePanelId}
            tabIndex={tab === 'live' ? 0 : -1}
            onClick={() => setTab('live')}
          >
            {t('matchStudioTabLive')}
          </button>
          <button
            type="button"
            role="tab"
            id={askTabId}
            className={[styles.tab, tab === 'ask' ? styles.tabActive : '']
              .filter(Boolean)
              .join(' ')}
            aria-selected={tab === 'ask'}
            aria-controls={askPanelId}
            tabIndex={tab === 'ask' ? 0 : -1}
            onClick={() => setTab('ask')}
          >
            {t('matchStudioTabAsk')}
          </button>
        </div>
        <div className={styles.actions}>
          {decisionSelected && selectedEvent ? (
            <button
              type="button"
              className={styles.actionLink}
              onClick={() => onOpenDecision(selectedEvent.id)}
            >
              {t('matchStudioWhatIf')}
            </button>
          ) : (
            <span
              className={styles.actionLink}
              aria-disabled="true"
              title={t('matchStudioWhatIfUnavailable')}
            >
              {t('matchStudioWhatIf')}
            </span>
          )}
          <button
            type="button"
            className={styles.actionLink}
            onClick={onDownloadReport}
          >
            {t('matchStudioReport')}
          </button>
        </div>
      </div>

      {tab === 'live' ? (
        <div
          className={styles.panel}
          role="tabpanel"
          id={livePanelId}
          aria-labelledby={liveTabId}
          data-testid="match-studio-live"
        >
          <div className={styles.feedHeader}>
            <p className={styles.detailNote}>{t('matchStudioLiveHint')}</p>
            <div className={styles.feedControls}>
              <Button
                variant="secondary"
                onClick={onPrevious}
                disabled={!canPrevious}
                aria-label={t('matchAnalysisPrevEvent')}
              >
                <ChevronLeft size={16} aria-hidden="true" />
                {t('matchAnalysisPrevEvent')}
              </Button>
              <Button
                variant="secondary"
                onClick={onNext}
                disabled={!canNext}
                aria-label={t('matchAnalysisNextEvent')}
              >
                {t('matchAnalysisNextEvent')}
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>

          {events.length === 0 ? (
            <p className={styles.status} role="status">
              {t('matchStudioLiveEmpty')}
            </p>
          ) : (
            <ol
              className={styles.feed}
              role="listbox"
              aria-label={t('matchStudioLiveFeed')}
            >
              {events.map((event) => {
                const selected = event.id === selectedEventId
                const teamName = resolveTeamName(event.teamId, homeTeam, awayTeam)
                const playerName = resolvePlayerName(event.playerId, players)
                const actors = [teamName, playerName].filter(Boolean).join(' · ')
                const cached = narrativeByEventId[event.id]
                const headline = cached
                  ? locale === 'ar'
                    ? cached.narrative.arabic.headline
                    : cached.narrative.english.headline
                  : null

                return (
                  <li key={event.id} className={styles.feedItem}>
                    <button
                      type="button"
                      ref={selected ? selectedRef : undefined}
                      className={[
                        styles.moment,
                        selected ? styles.momentSelected : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => onSelectEvent(event.id)}
                      role="option"
                      aria-selected={selected}
                      aria-label={`${eventTypeLabel(event.type, locale)} ${locale === 'ar' ? 'في' : 'at'} ${formatEventMinute(event.minute)}${selected ? `, ${t('matchAnalysisSelected')}` : ''}`}
                    >
                      <span className={styles.minute}>
                        {formatEventMinute(event.minute)}
                      </span>
                      <span className={styles.momentMeta}>
                        <span className={styles.type}>
                          {eventTypeLabel(event.type, locale)}
                        </span>
                        {actors ? (
                          <span className={styles.actors}>{actors}</span>
                        ) : null}
                        {selected ? (
                          <span className={styles.selectedBadge} aria-hidden="true">
                            {t('matchAnalysisSelected')}
                          </span>
                        ) : null}
                      </span>
                      {headline ? (
                        <p className={styles.narrative}>{headline}</p>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ol>
          )}

          {selectedEvent ? (
            <div className={styles.detail}>
              <p className={styles.detailNote}>
                {t('matchStudioLiveSelectedHint')}
              </p>
              {isDecisionCandidate(selectedEvent) ? (
                <Button
                  variant="secondary"
                  to={`/matches/${matchId}/decisions/${selectedEvent.id}`}
                >
                  {t('matchAnalysisDecisionCta')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className={`${styles.panel} ${styles.askPanel}`}
          role="tabpanel"
          id={askPanelId}
          aria-labelledby={askTabId}
          data-testid="match-studio-ask"
        >
          <div className={styles.askScroll}>
            <header className={styles.askHero}>
              <p className={styles.askEyebrow}>{t('matchStudioTabAsk')}</p>
              <h3 className={styles.askHeading}>{t('askCrewHeading')}</h3>
              <p className={styles.askSubtitle}>{t('askCrewSubtitle')}</p>
              <p className={styles.askCapabilities}>{t('askCrewCapabilities')}</p>
            </header>

            {selectedEvent ? (
              <dl className={styles.askContext} data-testid="ask-event-context">
                <div>
                  <dt>{t('eventFieldMinute')}</dt>
                  <dd>{formatEventMinute(selectedEvent.minute)}</dd>
                </div>
                <div>
                  <dt>{t('eventFieldType')}</dt>
                  <dd>{eventTypeLabel(selectedEvent.type, locale)}</dd>
                </div>
                <div>
                  <dt>{t('eventFieldTeam')}</dt>
                  <dd>
                    {resolveTeamName(selectedEvent.teamId, homeTeam, awayTeam) ??
                      t('matchAnalysisMissing')}
                  </dd>
                </div>
                <div>
                  <dt>{t('eventFieldPlayer')}</dt>
                  <dd>
                    {resolvePlayerName(selectedEvent.playerId, players) ??
                      t('matchAnalysisMissing')}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className={styles.status} role="status">
                {t('matchStudioAskNoEvent')}
              </p>
            )}

            <div className={styles.askSuggestionsBlock}>
              <div className={styles.askSuggestionsHeader}>
                <h4 className={styles.askSectionTitle}>
                  {t('askCrewSuggestionsHeading')}
                </h4>
                <div
                  className={styles.askFilters}
                  role="group"
                  aria-label={t('askCrewSuggestionsHeading')}
                >
                  {ASK_FILTERS.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={[
                        styles.askFilter,
                        askFilter === filter ? styles.askFilterActive : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-pressed={askFilter === filter}
                      onClick={() => setAskFilter(filter)}
                    >
                      {filterLabel(filter)}
                    </button>
                  ))}
                </div>
              </div>

              <ul
                className={styles.askSuggestionList}
                data-testid="ask-suggestion-list"
              >
                {visibleSuggestions.map((suggestion) => {
                  const unavailable = suggestion.unavailable
                  return (
                    <li key={suggestion.id}>
                      <button
                        type="button"
                        className={[
                          styles.askSuggestion,
                          unavailable ? styles.askSuggestionUnavailable : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => runSuggestion(suggestion)}
                        aria-disabled={unavailable ? true : undefined}
                        data-testid={`ask-suggestion-${suggestion.id}`}
                        data-action={suggestion.action}
                        data-unavailable={unavailable ? 'true' : 'false'}
                      >
                        <span className={styles.askSuggestionTitle}>
                          {t(suggestion.titleKey)}
                        </span>
                        <span className={styles.askSuggestionMeta}>
                          {unavailable ? (
                            <span className={styles.askUnavailableBadge}>
                              {t('askCrewUnavailableBadge')}
                            </span>
                          ) : null}
                          <span className={styles.askCapability}>
                            {t(suggestion.capabilityKey)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div
              className={styles.askAnswerRegion}
              aria-live="polite"
              data-testid="ask-answer-region"
            >
              {askOutcome.kind === 'suggestion_unavailable' ? (
                <p
                  className={styles.status}
                  role="status"
                  data-testid="ask-suggestion-unavailable"
                >
                  {t(askOutcome.reasonKey)}
                </p>
              ) : null}

              {askOutcome.kind === 'unsupported' ? (
                <p
                  className={styles.status}
                  role="status"
                  data-testid="ask-unsupported"
                >
                  {t(askOutcome.messageKey)}
                </p>
              ) : null}

              {askOutcome.kind === 'local_facts' ? (
                <div
                  className={styles.narrativeBlock}
                  data-testid="ask-local-facts"
                >
                  <p className={styles.evidenceTag}>{t('askCrewAnswerFacts')}</p>
                  <h4 className={styles.narrativeHeadline}>
                    {t('askCrewLocalFactsHeading')}
                  </h4>
                  <p className={styles.detailNote}>{t('askCrewLocalFactsNote')}</p>
                  <dl className={styles.askContext}>
                    <div>
                      <dt>{t('eventFieldMinute')}</dt>
                      <dd>
                        {askOutcome.answer.minuteLabel ??
                          t('matchAnalysisMissing')}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('eventFieldType')}</dt>
                      <dd>
                        {eventTypeLabel(askOutcome.answer.eventType, locale)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('eventFieldTeam')}</dt>
                      <dd>
                        {askOutcome.answer.teamName ??
                          t('matchAnalysisMissing')}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('eventFieldPlayer')}</dt>
                      <dd>
                        {askOutcome.answer.playerName ??
                          t('matchAnalysisMissing')}
                      </dd>
                    </div>
                    {askOutcome.answer.receiverName ||
                    askOutcome.answer.missing.includes('receiver') ? (
                      <div>
                        <dt>{t('eventFieldReceiver')}</dt>
                        <dd>
                          {askOutcome.answer.receiverName ??
                            t('matchAnalysisMissing')}
                        </dd>
                      </div>
                    ) : null}
                    {askOutcome.answer.shotOutcome ? (
                      <div>
                        <dt>{t('eventFieldOutcome')}</dt>
                        <dd>{askOutcome.answer.shotOutcome}</dd>
                      </div>
                    ) : null}
                    {askOutcome.answer.passOutcome ? (
                      <div>
                        <dt>{t('eventFieldOutcome')}</dt>
                        <dd>{askOutcome.answer.passOutcome}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {askOutcome.answer.missing.length > 0 ? (
                    <p className={styles.partial} role="status">
                      {t('askCrewLocalFactsMissing')}:{' '}
                      {askOutcome.answer.missing.join(', ')}
                    </p>
                  ) : null}
                  <p className={styles.detailNote}>
                    {t('decisionNarrativeProvenance')}:{' '}
                    {askOutcome.answer.provenance === 'synthetic'
                      ? t('decisionProvenanceSynthetic')
                      : t('decisionProvenanceApi')}
                  </p>
                  <div className={styles.askAnswerActions}>
                    <Button
                      variant="secondary"
                      onClick={() => onSelectEvent(askOutcome.eventId)}
                    >
                      {t('askCrewViewMoment')}
                    </Button>
                    {decisionSelected && selectedEvent ? (
                      <Button
                        variant="secondary"
                        onClick={() => onOpenDecision(selectedEvent.id)}
                      >
                        {t('askCrewCompareWhatIf')}
                      </Button>
                    ) : null}
                    <Button variant="ghost" onClick={clearAskPanel}>
                      {t('askCrewClear')}
                    </Button>
                  </div>
                </div>
              ) : null}

              {selectedEvent && !decisionSelected && askOutcome.kind === 'none' ? (
                <p className={styles.status} role="status">
                  {t('matchStudioAskNotDecision')}
                </p>
              ) : null}

              {narrativeState.status === 'loading' ? (
                <p
                  className={styles.status}
                  role="status"
                  aria-live="polite"
                  data-testid="ask-loading"
                >
                  {t('askCrewLoading')}
                </p>
              ) : null}

              {narrativeState.status === 'unavailable' ? (
                <div data-testid="ask-unavailable">
                  <p className={styles.status} role="status">
                    {t('decisionNarrativeUnavailable')} {narrativeState.message}
                  </p>
                  <div className={styles.askAnswerActions}>
                    <Button variant="secondary" onClick={onNarrativeRetry}>
                      {t('decisionNarrativeRetry')}
                    </Button>
                    <Button variant="ghost" onClick={clearAskPanel}>
                      {t('askCrewClear')}
                    </Button>
                  </div>
                </div>
              ) : null}

              {narrativeState.status === 'error' ? (
                <div data-testid="ask-error">
                  <p className={styles.status} role="alert">
                    {t('decisionNarrativeError')} {narrativeState.message}
                  </p>
                  <div className={styles.askAnswerActions}>
                    <Button variant="secondary" onClick={onNarrativeRetry}>
                      {t('decisionNarrativeRetry')}
                    </Button>
                    <Button variant="ghost" onClick={clearAskPanel}>
                      {t('askCrewClear')}
                    </Button>
                  </div>
                </div>
              ) : null}

              {localizedNarrative && narrativeState.status === 'ready' ? (
                <div
                  className={styles.narrativeBlock}
                  data-testid="match-studio-ask-narrative"
                >
                  {hasPartialNarrative ? (
                    <p className={styles.partial} role="status">
                      {t('askAgentsPartial')}
                    </p>
                  ) : null}
                  <div className={styles.evidenceTags}>
                    <span className={styles.evidenceTag}>
                      {t('askCrewAnswerFacts')}
                    </span>
                    <span className={styles.evidenceTag}>
                      {t('askCrewAnswerCalculated')}
                    </span>
                    {narrativeState.response.analysis.alternatives.length > 0 ? (
                      <span className={styles.evidenceTag}>
                        {t('askCrewAnswerAlternatives')}
                      </span>
                    ) : null}
                  </div>
                  <p className={styles.detailNote}>
                    {t('decisionNarrativeProvenance')}:{' '}
                    {narrativeState.response.provenance === 'synthetic'
                      ? t('decisionProvenanceSynthetic')
                      : t('decisionProvenanceApi')}
                    {' · '}
                    {formatEventMinute(
                      selectedEvent?.minute ??
                        events.find(
                          (item) => item.id === narrativeState.eventId,
                        )?.minute,
                    )}
                  </p>
                  <h3 className={styles.narrativeHeadline}>
                    {localizedNarrative.headline}
                  </h3>
                  <h4 className={styles.detailNote}>
                    {t('decisionNarrativeObservations')}
                  </h4>
                  <ul className={styles.list}>
                    {localizedNarrative.keyObservations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <h4 className={styles.detailNote}>
                    {t('decisionLimitationsHeading')}
                  </h4>
                  <ul className={styles.list}>
                    {localizedNarrative.limitations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {narrativeState.response.verificationResults.length > 0 ? (
                    <>
                      <h4 className={styles.detailNote}>
                        {t('askAgentsValidationHeading')}
                      </h4>
                      <ul className={styles.list}>
                        {narrativeState.response.verificationResults.map(
                          (result) => (
                            <li key={result.claimId}>
                              {result.claimId}:{' '}
                              {verificationLabel(
                                result.evidenceValidationStatus,
                                t,
                              )}
                              {result.evidence.length > 0
                                ? ` · ${result.evidence
                                    .map((ref) => `${ref.kind}:${ref.id}`)
                                    .join(', ')}`
                                : ''}
                            </li>
                          ),
                        )}
                      </ul>
                      <p className={styles.detailNote}>
                        {t('askAgentsTruthScope')}
                      </p>
                    </>
                  ) : null}
                  {localizedNarrative.limitations.length > 0 ||
                  hasPartialNarrative ? (
                    <p className={styles.detailNote}>
                      {t('askCrewAnswerUnknown')}
                    </p>
                  ) : null}
                  <div className={styles.askAnswerActions}>
                    <Button
                      variant="secondary"
                      onClick={() => onSelectEvent(narrativeState.eventId)}
                    >
                      {t('askCrewViewMoment')}
                    </Button>
                    {decisionSelected && selectedEvent ? (
                      <Button
                        variant="secondary"
                        onClick={() => onOpenDecision(selectedEvent.id)}
                      >
                        {t('askCrewCompareWhatIf')}
                      </Button>
                    ) : null}
                    <Button variant="ghost" onClick={clearAskPanel}>
                      {t('askCrewClear')}
                    </Button>
                  </div>
                </div>
              ) : null}

              {!hasAnswerSurface &&
              narrativeState.status === 'idle' &&
              decisionSelected ? (
                <p className={styles.detailNote} data-testid="ask-empty">
                  {t('askCrewEmptyState')}
                </p>
              ) : null}
            </div>
          </div>

          <form
            className={styles.askComposer}
            onSubmit={submitComposer}
            data-testid="ask-composer"
          >
            <label className={styles.askLabel} htmlFor={questionInputId}>
              {t('matchStudioAskQuestionLabel')}
            </label>
            <textarea
              id={questionInputId}
              ref={composerRef}
              className={styles.askInput}
              value={draftQuestion}
              onChange={(e) => {
                setDraftQuestion(e.target.value)
                if (askOutcome.kind === 'unsupported') {
                  setAskOutcome({ kind: 'none' })
                }
              }}
              onKeyDown={onComposerKeyDown}
              placeholder={t('matchStudioAskQuestionPlaceholder')}
              rows={2}
              aria-describedby={`${baseId}-composer-hint`}
            />
            <p id={`${baseId}-composer-hint`} className={styles.askComposerHint}>
              {t('askCrewComposerHint')}
            </p>
            <div className={styles.askButtons}>
              <Button
                type="submit"
                variant="primary"
                disabled={
                  narrativeState.status === 'loading' ||
                  (!draftQuestion.trim() && !decisionSelected)
                }
                aria-busy={narrativeState.status === 'loading'}
              >
                {narrativeState.status === 'loading'
                  ? t('askCrewLoading')
                  : t('matchStudioAskSubmitFreeForm')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setAskOutcome({ kind: 'none' })
                  setDraftQuestion('')
                  onAskSelectedEvent()
                }}
                disabled={!decisionSelected || narrativeState.status === 'loading'}
              >
                {t('matchStudioAskSelectedEvent')}
              </Button>
              {(askOutcome.kind !== 'none' || showNarrativeAnswer) &&
              narrativeState.status !== 'loading' ? (
                <Button type="button" variant="ghost" onClick={clearAskPanel}>
                  {t('askCrewClear')}
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
