import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { askOrchestrator } from '../../services/orchestrator/orchestratorClient'
import type { DecisionAnalysis, MatchSummary } from '../../types'
import type { DecisionNarrativeState } from '../../hooks/useDecisionNarrative'
import { useLocale } from '../../i18n/useLocale'
import styles from './DecisionAnalystChat.module.css'

type ChatMessage = {
  id: number
  role: 'user' | 'assistant' | 'system'
  text: string
  showChips?: boolean
  createdAt: number
  retryPrompt?: string
  isError?: boolean
  contextKey?: string
}

function textDirection(text: string, fallback: 'en' | 'ar'): 'rtl' | 'ltr' {
  if (/[\u0600-\u06FF]/.test(text)) return 'rtl'
  if (/[A-Za-z]/.test(text)) return 'ltr'
  return fallback === 'ar' ? 'rtl' : 'ltr'
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
  const clearSeenRef = useRef(clearSignal)

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

  async function ask(prompt: string) {
    const question = prompt.trim()
    if (!question || loading) return
    const userId = messageId + 1
    const assistantId = userId + 1
    setMessageId(userId)
    const contextKey = `${matchId}::${eventId}`
    setMessages((current) => [...current, { id: userId, role: 'user', text: question, contextKey, createdAt: Date.now() }])
    setInput('')
    setLastFailedPrompt(null)
    setLoading(true)
    try {
      const reply = await askOrchestrator({ message: question, matchId, eventId })
      setMessages((current) => [...current, { id: assistantId, role: 'assistant', text: reply, contextKey, createdAt: Date.now() }])
      setMessageId(assistantId)
    } catch {
      setLastFailedPrompt(question)
      setMessages((current) => [...current, {
        id: assistantId,
        role: 'assistant',
        text: t('analystOrchestratorError'),
        contextKey,
        showChips: true,
        createdAt: Date.now(),
        retryPrompt: question,
        isError: true,
      }])
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

  const starters = [
    t('analystChipSummary'),
    t('analystChipRanking'),
    t('analystChipAlternatives'),
    t('analystChipMatch'),
    t('analystChipFrame'),
    t('analystChipVerification'),
    t('analystChipLimitations'),
  ]
  const showChips = messages.length === 0 || messages[messages.length - 1]?.showChips
  const bare = layout === 'bare'
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')
  const contextChanged = Boolean(
    lastUserMessage?.contextKey &&
    lastUserMessage.contextKey !== `${matchId}::${eventId}`,
  )

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
        {contextChanged ? (
          <div className={styles.systemMessage} role="status">
            <p>{t('floatingAskContextChanged')}: {eventLabel?.trim() || eventId}</p>
          </div>
        ) : null}
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
            {starters.map((label) => (
              <button
                key={label}
                type="button"
                disabled={loading}
                onClick={() => void ask(label)}
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
