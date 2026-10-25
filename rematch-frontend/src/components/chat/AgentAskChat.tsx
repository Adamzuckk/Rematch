import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import type { AskCrewState } from '../../hooks/useAskCrew'
import { useLocale } from '../../i18n/locale'
import styles from './AgentAskChat.module.css'

export type AgentAskChatProps = {
  askCrewState: AskCrewState
  onAskQuestion: (question: string) => void
  onAskRetry?: () => void
  onClear?: () => void
  eventId?: string | null
  eventLabel?: string | null
  /** When true, omit the clear control (parent chrome owns it). */
  hideClear?: boolean
  /** Focus the composer when this becomes true. */
  focusComposer?: boolean
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

export function AgentAskChat({
  askCrewState,
  onAskQuestion,
  onAskRetry,
  onClear,
  eventId,
  eventLabel,
  hideClear = false,
  focusComposer = false,
}: AgentAskChatProps) {
  const { t, locale } = useLocale()
  const [draft, setDraft] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const loading = askCrewState.status === 'loading'
  const busy = loading
  const empty =
    askCrewState.turns.length === 0 && askCrewState.status === 'idle'
  const lastTurnEventId =
    askCrewState.turns.length > 0
      ? askCrewState.turns[askCrewState.turns.length - 1]!.eventId
      : null
  const selectionChanged =
    askCrewState.turns.length > 0 && (eventId ?? null) !== lastTurnEventId
  const contextNotice = selectionChanged
    ? eventLabel?.trim()
      ? `${t('floatingAskContextChanged')}: ${eventLabel.trim()}`
      : t('floatingAskNoEvent')
    : null

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [askCrewState, draft, contextNotice])

  useEffect(() => {
    if (focusComposer) inputRef.current?.focus()
  }, [focusComposer])

  function submit(question: string) {
    const trimmed = question.trim()
    if (!trimmed || busy) return
    setDraft('')
    onAskQuestion(trimmed)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit(draft)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit(draft)
    }
  }

  function clearConversation() {
    if (!onClear) return
    if (empty) return
    const confirmed = window.confirm(t('floatingAskClearConfirm'))
    if (confirmed) onClear()
  }

  return (
    <div
      className={styles.root}
      data-testid="agent-ask-chat"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      {!eventLabel ? (
        <p className={styles.contextBanner} role="status">
          {t('floatingAskNoEvent')}
        </p>
      ) : null}

      <div
        className={styles.thread}
        ref={threadRef}
        aria-live="polite"
        data-testid="agent-ask-thread"
      >
        {contextNotice ? (
          <p
            className={styles.contextNotice}
            role="status"
            data-testid="agent-ask-context-notice"
          >
            {contextNotice}
          </p>
        ) : null}
        {empty ? (
          <p className={styles.empty} data-testid="agent-ask-empty">
            {t('askCrewEmptyState')}
          </p>
        ) : null}

        {askCrewState.turns.map((turn) => {
          return (
            <div key={turn.id} className={styles.turn} data-testid="ask-turn">
              <div className={`${styles.message} ${styles.userMessage}`}>
                <p className={styles.meta}>
                  <span>{t('askCrewYouLabel')}</span>
                  <time dateTime={new Date(turn.createdAt).toISOString()}>
                    {formatTime(new Date(turn.createdAt), locale)}
                  </time>
                </p>
                <p>{turn.question}</p>
              </div>
              <div className={`${styles.message} ${styles.assistantMessage}`}>
                <p className={styles.meta}>
                  <span>{t('askCrewCrewLabel')}</span>
                </p>
                {turn.error ? (
                  <p className={styles.status} role="status">
                    {turn.error}
                  </p>
                ) : null}
                {turn.reply ? <p className={styles.headline}>{turn.reply}</p> : null}
              </div>
            </div>
          )
        })}

        {askCrewState.status === 'loading' ? (
          <>
            <div className={`${styles.message} ${styles.userMessage}`}>
              <p className={styles.meta}>{t('askCrewYouLabel')}</p>
              <p>{askCrewState.pendingQuestion}</p>
            </div>
            <p className={styles.loading} role="status" data-testid="agent-ask-loading">
              {t('askCrewLoading')}
            </p>
          </>
        ) : null}

        {askCrewState.status === 'error' ? (
          <div className={styles.errorBlock} role="alert" data-testid="agent-ask-error">
            <div className={`${styles.message} ${styles.userMessage}`}>
              <p className={styles.meta}>{t('askCrewYouLabel')}</p>
              <p>{askCrewState.lastQuestion}</p>
            </div>
            <p className={styles.status}>
              {t('askCrewError')} {askCrewState.message}
            </p>
            {onAskRetry ? (
              <button
                type="button"
                className={styles.retry}
                onClick={onAskRetry}
              >
                {t('loadErrorRetry')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <form className={styles.composer} onSubmit={onSubmit}>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('floatingAskAgentPlaceholder')}
          aria-label={t('floatingAskAgentPlaceholder')}
          rows={2}
          maxLength={500}
          disabled={busy}
          data-testid="agent-ask-input"
        />
        <div className={styles.composerActions}>
          {!hideClear && onClear ? (
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={clearConversation}
              disabled={busy || empty}
            >
              {t('askCrewClear')}
            </button>
          ) : null}
          <button type="submit" disabled={busy || !draft.trim()}>
            {t('analystSend')}
          </button>
        </div>
      </form>
    </div>
  )
}
