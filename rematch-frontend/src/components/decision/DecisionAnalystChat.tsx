import { useEffect, useRef, useState } from 'react'
import { matchService } from '../../services/matches'
import type { DecisionAnalysis, DecisionNarrativeResponse } from '../../types'
import { useLocale } from '../../i18n/useLocale'
import styles from './DecisionAnalystChat.module.css'

type Intent = 'summary' | 'ranking' | 'alternative' | 'verification' | 'limitations' | 'help'
type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  text: string
  cite?: boolean
}

function detectIntent(query: string): Intent {
  const text = query.toLocaleLowerCase()
  if (/verif|evidence|claim|تحقق|دليل|أدلة|ادعاء|ادعاءات/.test(text)) return 'verification'
  if (/limit|limitation|محدود|قيود|حدود|ملاحظة/.test(text)) return 'limitations'
  if (/summar|explain|why|ملخص|لخص|اشرح|لماذا/.test(text)) return 'summary'
  if (/alternat|بديل|بدائل/.test(text)) return 'alternative'
  if (/score|rank|alternat|higher|ترتيب|درجة|بديل|أعلى|المرصود/.test(text)) return 'ranking'
  return 'help'
}

function exactValue(value: number | null | undefined, unavailable: string): string {
  return value == null ? unavailable : String(value)
}

function summarizeAnswer(
  analysis: DecisionAnalysis,
  narrative: DecisionNarrativeResponse,
  locale: 'en' | 'ar',
  t: ReturnType<typeof useLocale>['t'],
): string {
  const localized = locale === 'ar' ? narrative.narrative.arabic : narrative.narrative.english
  const points = localized.keyObservations.slice(0, 3)
  return [
    localized.headline,
    ...points.map((point) => `• ${point}`),
    ...localized.limitations.slice(0, 1).map((limitation) => `${t('analystLimitation')}: ${limitation}`),
    `${t('analystObservedAction')}: ${analysis.observed.label}`,
    `${t('analystScore')}: ${exactValue(analysis.observed.compositeScore, t('decisionMetricUnavailable'))}`,
  ].join('\n')
}

function rankingAnswer(
  analysis: DecisionAnalysis,
  showBestAlternative: boolean,
  t: ReturnType<typeof useLocale>['t'],
): string {
  const observedRank = analysis.ranking.find(
    (entry) => entry.actionId === analysis.observed.actionId,
  )?.rank
  const higherEntries = observedRank == null
    ? []
    : [...analysis.ranking]
        .filter((entry) => entry.rank != null && entry.rank < observedRank)
        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
  const bestAlternative = showBestAlternative
    ? [...analysis.ranking]
        .filter((entry) => entry.actionId !== analysis.observed.actionId)
        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))[0]
    : null
  const observed = `${t('analystObservedAction')}: ${analysis.observed.label} · ${t('analystScore')}: ${exactValue(analysis.observed.compositeScore, t('decisionMetricUnavailable'))} · ${t('decisionRankLabel')}: ${observedRank == null ? t('decisionMetricUnavailable') : String(observedRank)}`
  if (higherEntries.length === 0) {
    if (bestAlternative) {
      return `${observed}\n${t('analystBestAlternative')}: ${bestAlternative.label} · ${t('analystScore')}: ${exactValue(bestAlternative.compositeScore, t('decisionMetricUnavailable'))} · ${t('decisionRankLabel')}: ${bestAlternative.rank == null ? t('decisionMetricUnavailable') : String(bestAlternative.rank)}`
    }
    return `${observed}\n${t('analystNoHigher')}`
  }
  const lines = [
    observed,
    `${t('analystRankedAbove')}:`,
    ...higherEntries.map((entry) => `• #${entry.rank} ${entry.label} · ${t('analystScore')}: ${exactValue(entry.compositeScore, t('decisionMetricUnavailable'))}`),
  ]
  if (bestAlternative && !higherEntries.some((entry) => entry.actionId === bestAlternative.actionId)) {
    lines.push(`${t('analystBestAlternative')}: ${bestAlternative.label} · ${t('analystScore')}: ${exactValue(bestAlternative.compositeScore, t('decisionMetricUnavailable'))} · ${t('decisionRankLabel')}: ${bestAlternative.rank == null ? t('decisionMetricUnavailable') : String(bestAlternative.rank)}`)
  }
  return lines.join('\n')
}

function verificationAnswer(
  response: DecisionNarrativeResponse,
  t: ReturnType<typeof useLocale>['t'],
): string {
  const results = response.verificationResults
  const counts = {
    verified: results.filter((result) => result.evidenceValidationStatus === 'verified').length,
    partial: results.filter((result) => result.evidenceValidationStatus === 'partially_supported').length,
    unsupported: results.filter((result) => result.evidenceValidationStatus === 'unsupported').length,
  }
  return [
    `${t('analystVerificationTotal')}: ${results.length}`,
    `${t('decisionPipelineVerified')}: ${counts.verified}`,
    `${t('decisionPipelinePartiallySupported')}: ${counts.partial}`,
    `${t('decisionPipelineUnsupported')}: ${counts.unsupported}`,
    t('analystClaimSupportNote'),
  ].join('\n')
}

function limitationsAnswer(
  analysis: DecisionAnalysis,
  response: DecisionNarrativeResponse,
  locale: 'en' | 'ar',
  t: ReturnType<typeof useLocale>['t'],
): string {
  const narrative = locale === 'ar' ? response.narrative.arabic : response.narrative.english
  const items = [...new Set([...analysis.limitations, ...narrative.limitations])]
  return items.length
    ? items.map((item) => `• ${item}`).join('\n')
    : t('analystNoLimitations')
}

export function DecisionAnalystChat({
  matchId,
  eventId,
}: {
  matchId: string
  eventId: string
}) {
  const { locale, t } = useLocale()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messageId, setMessageId] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const route = `/matches/${encodeURIComponent(matchId)}/decisions/${encodeURIComponent(eventId)}`

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [messages, loading])

  async function ask(prompt: string, forcedIntent?: Intent) {
    const question = prompt.trim()
    if (!question || loading) return
    const userMessageId = messageId + 1
    setMessageId(userMessageId)
    setMessages((current) => [...current, { id: userMessageId, role: 'user', text: question }])
    setInput('')
    setLoading(true)
    try {
      const intent = forcedIntent ?? detectIntent(question)
      if (import.meta.env.VITE_MATCH_DATA_SOURCE !== 'api') {
        const apiModeMessageId = userMessageId + 1
        setMessages((current) => [
          ...current,
          { id: apiModeMessageId, role: 'assistant', text: t('analystApiModeRequired') },
        ])
        setMessageId(apiModeMessageId)
        return
      }
      const analysis = await matchService.getDecisionAnalysis(matchId, eventId)
      let narrative: DecisionNarrativeResponse | undefined
      if (intent === 'summary' || intent === 'verification' || intent === 'limitations') {
        narrative = await matchService.getDecisionNarrative(matchId, eventId)
      }

      let answer: string
      switch (intent) {
        case 'summary':
          answer = summarizeAnswer(analysis, narrative!, locale, t)
          break
        case 'ranking':
          answer = rankingAnswer(analysis, false, t)
          break
        case 'alternative':
          answer = rankingAnswer(analysis, true, t)
          break
        case 'verification':
          answer = verificationAnswer(narrative!, t)
          break
        case 'limitations':
          answer = limitationsAnswer(analysis, narrative!, locale, t)
          break
        default:
          answer = t('analystHelp')
      }
      setMessages((current) => [...current, { id: userMessageId + 1, role: 'assistant', text: answer, cite: true }])
      setMessageId(userMessageId + 1)
    } catch {
      setMessages((current) => [
        ...current,
        { id: userMessageId + 1, role: 'assistant', text: t('analystError') },
      ])
      setMessageId(userMessageId + 1)
    } finally {
      setLoading(false)
    }
  }

  const starters: { intent: Intent; label: string }[] = [
    { intent: 'summary', label: t('analystChipSummary') },
    { intent: 'ranking', label: t('analystChipRanking') },
    { intent: 'verification', label: t('analystChipVerification') },
    { intent: 'limitations', label: t('analystChipLimitations') },
  ]

  return (
    <>
      <button
        type="button"
        className={styles.launcher}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {t('analystOpen')}
      </button>
      {open ? (
        <div className={styles.scrim} onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false)
        }}>
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="decision-analyst-title"
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
          >
            <header className={styles.header}>
              <div>
                <h2 id="decision-analyst-title">{t('analystTitle')}</h2>
                <p>{t('analystSubtitle')}</p>
              </div>
              <button type="button" className={styles.close} aria-label={t('analystClose')} onClick={() => setOpen(false)}>×</button>
            </header>
            <div className={styles.thread} ref={threadRef} aria-live="polite">
              {messages.length === 0 ? (
                <div className={styles.starters}>
                  {starters.map(({ intent, label }) => (
                    <button key={intent} type="button" disabled={loading} onClick={() => void ask(label, intent)}>
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              {messages.map((message) => (
                <div key={message.id} className={`${styles.message} ${message.role === 'user' ? styles.userMessage : styles.assistantMessage}`}>
                  <p>{message.text}</p>
                  {message.cite ? <a href={route} className={styles.citation}>{t('analystCitation')}</a> : null}
                </div>
              ))}
              {loading ? <p className={styles.loading} role="status">{t('analystLoading')}</p> : null}
            </div>
            <form className={styles.composer} onSubmit={(event) => {
              event.preventDefault()
              void ask(input)
            }}>
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={t('analystPlaceholder')}
                aria-label={t('analystPlaceholder')}
                maxLength={500}
                disabled={loading}
              />
              <button type="submit" disabled={loading || !input.trim()}>{t('analystSend')}</button>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  )
}
