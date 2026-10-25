import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { matchService } from '../../services/matches'
import { askOrchestrator, isRetryableOrchestratorError } from '../../services/orchestrator/orchestratorClient'
import type { DecisionAnalysis, DecisionNarrativeResponse, MatchSummary } from '../../types'
import type { DecisionNarrativeState } from '../../hooks/useDecisionNarrative'
import { useLocale } from '../../i18n/useLocale'
import styles from './DecisionAnalystChat.module.css'

type Intent =
  | 'greeting'
  | 'help'
  | 'score'
  | 'ranking'
  | 'alternatives'
  | 'verification'
  | 'summary'
  | 'limitations'
  | 'frame'
  | 'event'
  | 'match'
type ChatMessage = {
  id: number
  role: 'user' | 'assistant' | 'system'
  text: string
  source?: 'analysis' | 'narrative' | 'match'
  showChips?: boolean
  createdAt: number
  retryPrompt?: string
  isError?: boolean
}

/** Per-bubble direction from origin/main bilingual chat polish. */
function textDirection(text: string, fallback: 'en' | 'ar'): 'rtl' | 'ltr' {
  if (/[\u0600-\u06FF]/.test(text)) return 'rtl'
  if (/[A-Za-z]/.test(text)) return 'ltr'
  return fallback === 'ar' ? 'rtl' : 'ltr'
}

type SessionCache = {
  key: string
  analysis?: DecisionAnalysis
  narrative?: DecisionNarrativeResponse
  match?: MatchSummary | null
}
type Translator = ReturnType<typeof useLocale>['t']

function detectIntent(query: string): Intent {
  // NFKC + Arabic diacritic strip from origin/main improves Arabic intent matching.
  const text = query.trim().toLocaleLowerCase().normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '')
  if (/^(hi|hello|hey|good morning|good afternoon|السلام عليكم|مرحبا|أهلا|اهلا|صباح الخير|مساء الخير)[!?.،\s]*$/.test(text)) return 'greeting'
  if (/alternat|other options|list options|top\s*\d+|البدائل|بدائل|خيارات أخرى|خيارات اخرى/.test(text)) return 'alternatives'
  if (/how many.*(?:players?|teammates?|opponents?|people|in the frame)|number of (?:players?|teammates?|opponents?)|players? (?:here|in the frame)|teammates?|opponents?|frame|completeness|aligned frame|كم لاعب|عدد اللاعبين|اللاعبين|الزملاء|الخصوم|إطار|اطار|اكتمال/.test(text)) return 'frame'
  if (/match (?:score|result|context|details)|teams? (?:are )?(?:in|playing)|which teams|what teams|who (?:is )?playing|scoreline|المباراة|الفريقان|الفريقين|النتيجة النهائية/.test(text)) return 'match'
  if (/verif|evidence|claim|support status|not_assessed|تحقق|دليل|أدلة|ادعاء|ادعاءات|مراجع الأدلة/.test(text)) return 'verification'
  if (/limit|limitation|caveat|قيود|حدود|محدودية|ملاحظة/.test(text)) return 'limitations'
  if (/rank|higher|above|better rank|ترتيب|أعلى|اعلى|سبق|مرتبة أعلى/.test(text)) return 'ranking'
  if (/score|metric|distance|progress|xg|probability|degree|درجة|الدرجة|النتيجة الهندسية|مقياس|مقاييس|احتمال/.test(text)) return 'score'
  if (/event|moment|minute|player name|who (?:passed|acted|was the player)|who performed|what happened|نوع الحدث|الحدث|اللحظة|الدقيقة|اسم اللاعب|من اللاعب|من مرر|ماذا حدث/.test(text)) return 'event'
  if (/summar|explain|why|decision|ملخص|لخص|اشرح|لماذا|القرار/.test(text)) return 'summary'
  if (/^(help|؟|\?|مساعدة|ساعدني)[!?.،\s]*$/.test(text)) return 'help'
  return 'help'
}

function exactValue(value: number | null | undefined, unavailable: string): string {
  return value == null || !Number.isFinite(value) ? unavailable : String(value)
}

function observedRank(analysis: DecisionAnalysis): number | null {
  return analysis.ranking.find((entry) => entry.actionId === analysis.observed.actionId)?.rank ?? null
}

function observedLine(analysis: DecisionAnalysis, t: Translator): string {
  return `${t('analystObservedAction')}: ${analysis.observed.label} · ${t('analystScore')}: ${exactValue(analysis.observed.compositeScore, t('decisionMetricUnavailable'))} · ${t('decisionRankLabel')}: ${exactValue(observedRank(analysis), t('decisionMetricUnavailable'))}`
}

function rankedAboveAnswer(analysis: DecisionAnalysis, t: Translator): string {
  const rank = observedRank(analysis)
  const higher = rank == null
    ? []
    : analysis.ranking
        .filter((entry) => entry.rank != null && entry.rank < rank)
        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
        .slice(0, 5)
  if (!higher.length) return `${t('analystNoHigher')}\n• ${observedLine(analysis, t)}`
  return [
    observedLine(analysis, t),
    t('analystRankedAbove'),
    ...higher.map((entry) => `• #${entry.rank} ${entry.label} · ${t('analystScore')}: ${exactValue(entry.compositeScore, t('decisionMetricUnavailable'))}`),
  ].join('\n')
}

function alternativesAnswer(query: string, analysis: DecisionAnalysis, t: Translator): string {
  const requested = query.match(/\btop\s*(\d+)\b/i)
  const limit = requested ? Math.max(1, Math.min(5, Number(requested[1]))) : 3
  const entries = [...analysis.alternatives]
    .sort((a, b) => {
      const aRank = analysis.ranking.find((entry) => entry.actionId === a.actionId)?.rank ?? Infinity
      const bRank = analysis.ranking.find((entry) => entry.actionId === b.actionId)?.rank ?? Infinity
      return aRank - bRank
    })
    .slice(0, limit)
  if (!entries.length) return t('analystNoAlternatives')
  return [
    `${t('analystAlternatives')} (${exactValue(analysis.completeness.alternativeCount, t('decisionMetricUnavailable'))})`,
    ...entries.map((entry) => {
      const rank = analysis.ranking.find((item) => item.actionId === entry.actionId)?.rank
      return `• ${rank == null ? entry.label : `#${rank} ${entry.label}`} · ${t('analystScore')}: ${exactValue(entry.compositeScore, t('decisionMetricUnavailable'))}`
    }),
  ].join('\n')
}

function scoreAnswer(analysis: DecisionAnalysis, t: Translator): string {
  const metrics = analysis.observed.metrics.slice(0, 5).map((metric) => {
    const value = metric.status === 'available' && metric.value != null
      ? `${String(metric.value)}${metric.unit ? ` ${metric.unit}` : ''}`
      : t('decisionMetricUnavailable')
    return `• ${metric.name}: ${value}`
  })
  return [
    `${t('analystObservedScore')}: ${exactValue(analysis.observed.compositeScore, t('decisionMetricUnavailable'))}`,
    ...metrics,
    `${t('analystScoringMethod')}: ${analysis.scoringMethodId}@${analysis.scoringMethodVersion}`,
  ].join('\n')
}

function verificationAnswer(response: DecisionNarrativeResponse, t: Translator): string {
  const results = response.verificationResults
  const counts = {
    verified: results.filter((result) => result.evidenceValidationStatus === 'verified').length,
    partial: results.filter((result) => result.evidenceValidationStatus === 'partially_supported').length,
    unsupported: results.filter((result) => result.evidenceValidationStatus === 'unsupported').length,
  }
  return [
    `${t('analystVerificationTotal')}: ${results.length}`,
    `• ${t('decisionPipelineVerified')}: ${counts.verified}`,
    `• ${t('decisionPipelinePartiallySupported')}: ${counts.partial}`,
    `• ${t('decisionPipelineUnsupported')}: ${counts.unsupported}`,
    t('analystClaimSupportNote'),
  ].join('\n')
}

function summaryAnswer(response: DecisionNarrativeResponse, locale: 'en' | 'ar', t: Translator): string {
  const localized = locale === 'ar' ? response.narrative.arabic : response.narrative.english
  return [
    localized.headline,
    ...localized.keyObservations.slice(0, 3).map((point) => `• ${point}`),
    ...localized.limitations.slice(0, 1).map((item) => `${t('analystLimitation')}: ${item}`),
  ].join('\n')
}

function limitationsAnswer(analysis: DecisionAnalysis, t: Translator): string {
  const unique = [...new Map(analysis.limitations
    .map((item) => [item.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(), item] as const)
    .filter(([key]) => key.length > 0)).values()].slice(0, 3)
  return unique.length
    ? [t('analystLimitationsLead'), ...unique.map((item) => `• ${item}`)].join('\n')
    : t('analystNoLimitations')
}

function frameAnswer(analysis: DecisionAnalysis, t: Translator): string {
  const frame = analysis.completeness
  return [
    t('analystFrameLead'),
    `• ${t('analystTeammates')}: ${String(frame.teammatePositionsInFrame)}`,
    `• ${t('analystOpponents')}: ${String(frame.opponentPositionsInFrame)}`,
    `• ${t('analystAlternativeCount')}: ${String(frame.alternativeCount)}`,
    `• ${t('analystAlignedFrame')}: ${frame.hasAlignedFrame ? t('analystYes') : t('analystNo')}`,
  ].join('\n')
}

function contextAnswer(analysis: DecisionAnalysis, t: Translator): string {
  const minute = analysis.context.minute
  const playerName = analysis.context.playerName
  const lines = [t('analystEventLead'), `• ${t('analystEventType')}: ${analysis.eventType}`]
  if (typeof minute === 'number' || typeof minute === 'string') lines.push(`• ${t('analystMinute')}: ${String(minute)}`)
  if (typeof playerName === 'string' && playerName.trim()) lines.push(`• ${t('analystPlayer')}: ${playerName}`)
  if (lines.length === 2) lines.push(t('analystNoEventContext'))
  return lines.join('\n')
}

function matchAnswer(match: MatchSummary | null, t: Translator): string {
  if (!match) return t('analystMatchUnavailable')
  const lines = [
    t('analystMatchLead'),
    `• ${t('analystTeams')}: ${match.homeTeam.name} – ${match.awayTeam.name}`,
    `• ${t('analystCompetition')}: ${match.competition}`,
  ]
  if (match.score) lines.push(`• ${t('analystMatchScore')}: ${String(match.score.home)}–${String(match.score.away)}`)
  else lines.push(`• ${t('analystMatchScore')}: ${t('decisionMetricUnavailable')}`)
  if (match.minute != null) lines.push(`• ${t('analystMinute')}: ${String(match.minute)}`)
  return lines.join('\n')
}

function formatTime(date: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  } catch {
    return ''
  }
}

export function DecisionAnalystChat({
  matchId,
  eventId,
  match,
  analysis: initialAnalysis,
  narrativeState,
  layout = 'embedded',
  eventLabel,
  clearSignal = 0,
  focusComposer = false,
}: {
  matchId: string
  eventId: string
  match?: MatchSummary
  analysis?: DecisionAnalysis
  narrativeState?: DecisionNarrativeState
  /** `bare` omits the local header — used inside FloatingAskChat. */
  layout?: 'embedded' | 'bare'
  eventLabel?: string | null
  /** Increment to clear the conversation from a parent chrome control. */
  clearSignal?: number
  focusComposer?: boolean
}) {
  const { locale, t } = useLocale()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messageId, setMessageId] = useState(0)
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const contextKeyRef = useRef(`${matchId}::${eventId}`)
  const clearSeenRef = useRef(clearSignal)
  const route = `/matches/${encodeURIComponent(matchId)}/decisions/${encodeURIComponent(eventId)}`
  const matchRoute = `/matches/${encodeURIComponent(matchId)}`
  const initialNarrative = narrativeState?.status === 'ready' ? narrativeState.response : undefined
  const sessionCache = useRef<SessionCache>({ key: `${matchId}::${eventId}`, match, analysis: initialAnalysis, narrative: initialNarrative })
  const cacheKey = `${matchId}::${eventId}`

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [messages, loading])

  useEffect(() => {
    if (focusComposer) inputRef.current?.focus()
  }, [focusComposer])

  useEffect(() => {
    if (clearSignal === clearSeenRef.current) return
    clearSeenRef.current = clearSignal
    setMessages([])
    setInput('')
    setLoading(false)
    setLastFailedPrompt(null)
  }, [clearSignal])

  useEffect(() => {
    const nextKey = `${matchId}::${eventId}`
    if (contextKeyRef.current === nextKey) return
    contextKeyRef.current = nextKey
    sessionCache.current = {
      key: nextKey,
      match,
      analysis: initialAnalysis,
      narrative: initialNarrative,
    }
    const label = eventLabel?.trim() || eventId
    setMessages((current) => {
      if (current.length === 0) return current
      const id = Date.now()
      return [
        ...current,
        {
          id,
          role: 'system',
          text: `${t('floatingAskContextChanged')}: ${label}`,
          createdAt: Date.now(),
        },
      ]
    })
    setLastFailedPrompt(null)
  }, [matchId, eventId, eventLabel, match, initialAnalysis, initialNarrative, t])

  async function ask(prompt: string, forcedIntent?: Intent) {
    const question = prompt.trim()
    if (!question || loading) return
    const userId = messageId + 1
    const assistantId = userId + 1
    setMessageId(userId)
    setMessages((current) => [
      ...current,
      { id: userId, role: 'user', text: question, createdAt: Date.now() },
    ])
    setInput('')
    setLastFailedPrompt(null)
    const intent = forcedIntent ?? detectIntent(question)
    setLoading(true)
    try {
      try {
        const reply = await askOrchestrator({ message: question, matchId, eventId })
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: 'assistant',
            text: reply,
            createdAt: Date.now(),
          },
        ])
        setMessageId(assistantId)
        return
      } catch (error) {
        if (!isRetryableOrchestratorError(error)) throw error
      }

      // Keep the existing deterministic API-backed answer path as an outage fallback.
      if (intent === 'greeting' || intent === 'help') {
        const response = intent === 'greeting' ? t('analystGreeting') : t('analystHelp')
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: 'assistant',
            text: response,
            showChips: true,
            createdAt: Date.now(),
          },
        ])
        setMessageId(assistantId)
        return
      }

      if (import.meta.env.VITE_MATCH_DATA_SOURCE !== 'api') {
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: 'assistant',
            text: t('analystApiModeRequired'),
            showChips: true,
            createdAt: Date.now(),
          },
        ])
        setMessageId(assistantId)
        return
      }

      if (sessionCache.current.key !== cacheKey) {
        sessionCache.current = { key: cacheKey, match, analysis: initialAnalysis, narrative: initialNarrative }
      }
      if (match) sessionCache.current.match = match
      if (!sessionCache.current.analysis && initialAnalysis) sessionCache.current.analysis = initialAnalysis
      if (!sessionCache.current.analysis) {
        sessionCache.current.analysis = await matchService.getDecisionAnalysis(matchId, eventId)
      }
      const analysis = sessionCache.current.analysis
      let answer: string
      let source: ChatMessage['source'] = 'analysis'
      switch (intent) {
        case 'score':
          answer = scoreAnswer(analysis, t)
          break
        case 'ranking':
          answer = rankedAboveAnswer(analysis, t)
          break
        case 'alternatives':
          answer = alternativesAnswer(question, analysis, t)
          break
        case 'frame':
          answer = frameAnswer(analysis, t)
          break
        case 'event':
          answer = contextAnswer(analysis, t)
          break
        case 'match': {
          if (sessionCache.current.match === undefined) {
            sessionCache.current.match = await matchService.getMatchById(matchId)
          }
          answer = matchAnswer(sessionCache.current.match ?? null, t)
          source = 'match'
          break
        }
        case 'limitations':
          answer = limitationsAnswer(analysis, t)
          break
        case 'summary':
        case 'verification': {
          if (!sessionCache.current.narrative && initialNarrative) sessionCache.current.narrative = initialNarrative
          if (!sessionCache.current.narrative) {
            sessionCache.current.narrative = await matchService.getDecisionNarrative(matchId, eventId)
          }
          const narrative = sessionCache.current.narrative
          answer = intent === 'summary'
            ? summaryAnswer(narrative, locale, t)
            : verificationAnswer(narrative, t)
          source = 'narrative'
          break
        }
        default:
          answer = t('analystHelp')
      }
      const disclaimers: string[] = []
      if (analysis.provenance === 'synthetic') disclaimers.push(t('analystSyntheticDisclaimer'))
      if (intent === 'score' || intent === 'ranking' || intent === 'alternatives') {
        disclaimers.push(t('analystGeometricDisclaimer'))
      }
      const finalText = [answer, ...new Set(disclaimers)].join('\n')
      setMessages((current) => [
        ...current,
        {
          id: assistantId,
          role: 'assistant',
          text: finalText,
          source,
          createdAt: Date.now(),
        },
      ])
      setMessageId(assistantId)
    } catch {
      setLastFailedPrompt(question)
      setMessages((current) => [
        ...current,
        {
          id: assistantId,
          role: 'assistant',
          text: t('analystOrchestratorError'),
          showChips: true,
          createdAt: Date.now(),
          retryPrompt: question,
          isError: true,
        },
      ])
      setMessageId(assistantId)
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void ask(input)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void ask(input)
    }
  }

  function clearConversation() {
    if (messages.length === 0) return
    if (!window.confirm(t('floatingAskClearConfirm'))) return
    setMessages([])
    setInput('')
    setLastFailedPrompt(null)
  }

  const starters: { intent: Intent; label: string }[] = [
    { intent: 'summary', label: t('analystChipSummary') },
    { intent: 'ranking', label: t('analystChipRanking') },
    { intent: 'alternatives', label: t('analystChipAlternatives') },
    { intent: 'match', label: t('analystChipMatch') },
    { intent: 'frame', label: t('analystChipFrame') },
    { intent: 'verification', label: t('analystChipVerification') },
    { intent: 'limitations', label: t('analystChipLimitations') },
  ]
  const showChips = messages.length === 0 || messages[messages.length - 1]?.showChips
  const bare = layout === 'bare'

  return (
    <section
      className={bare ? styles.bare : styles.panel}
      aria-labelledby={bare ? undefined : 'decision-analyst-title'}
      data-testid="decision-analyst-chat"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      {!bare ? (
        <header className={styles.header}>
          <div>
            <h3 id="decision-analyst-title" className={styles.embeddedTitle}>
              {t('analystTitle')}
            </h3>
            <p>{t('analystSubtitle')}</p>
          </div>
        </header>
      ) : null}
      <div className={styles.thread} ref={threadRef} aria-live="polite">
        {messages.length === 0 ? (
          <section className={styles.welcome} aria-label={t('analystWelcome')}>
            <h3>{t('analystWelcome')}</h3>
            <p>{t('analystWelcomeNote')}</p>
          </section>
        ) : null}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`${styles.message} ${
              message.role === 'user'
                ? styles.userMessage
                : message.role === 'system'
                  ? styles.systemMessage
                  : styles.assistantMessage
            }`}
          >
            {message.role !== 'system' ? (
              <p className={styles.meta}>
                <span>
                  {message.role === 'user' ? t('askCrewYouLabel') : t('analystTitle')}
                </span>
                <time dateTime={new Date(message.createdAt).toISOString()}>
                  {formatTime(new Date(message.createdAt), locale)}
                </time>
              </p>
            ) : null}
            <p dir={textDirection(message.text, locale)}>{message.text}</p>
            {message.source ? (
              <a
                href={
                  message.source === 'match' ? matchRoute : route
                }
                className={styles.citation}
              >
                {message.source === 'narrative'
                  ? t('analystNarrativeCitation')
                  : message.source === 'match'
                    ? t('analystMatchCitation')
                    : t('analystCitation')}
              </a>
            ) : null}
            {message.isError && message.retryPrompt ? (
              <button
                type="button"
                className={styles.retry}
                disabled={loading}
                onClick={() => void ask(message.retryPrompt!)}
              >
                {t('loadErrorRetry')}
              </button>
            ) : null}
          </div>
        ))}
        {showChips ? (
          <div className={styles.starters} aria-label={t('analystSuggestions')}>
            <span>{t('analystSuggestions')}</span>
            {starters.map(({ intent, label }) => (
              <button
                key={intent}
                type="button"
                disabled={loading}
                onClick={() => void ask(label, intent)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {loading ? (
          <div className={styles.loading} role="status">
            <span>{t('analystOrchestratorLoading')}</span>
            <span className={styles.typingDots} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        ) : null}
      </div>
      <form className={styles.composer} onSubmit={onSubmit}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('analystPlaceholder')}
          aria-label={t('analystPlaceholder')}
          rows={2}
          maxLength={500}
          disabled={loading}
          dir={textDirection(input, locale)}
        />
        <div className={styles.composerActions}>
          {!bare ? (
            <button
              type="button"
              className={styles.clearButton}
              disabled={loading || messages.length === 0}
              onClick={clearConversation}
            >
              {t('askCrewClear')}
            </button>
          ) : null}
          {lastFailedPrompt && bare ? (
            <button
              type="button"
              className={styles.clearButton}
              disabled={loading}
              onClick={() => void ask(lastFailedPrompt)}
            >
              {t('loadErrorRetry')}
            </button>
          ) : null}
          <button type="submit" disabled={loading || !input.trim()}>
            {t('analystSend')}
          </button>
        </div>
      </form>
    </section>
  )
}
