import { MessageCircle, X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { DecisionAnalysis, MatchSummary } from '../../types'
import type { DecisionNarrativeState } from '../../hooks/useDecisionNarrative'
import type { AskCrewState } from '../../hooks/useAskCrew'
import { useLocale } from '../../i18n/locale'
import { DecisionAnalystChat } from '../decision/DecisionAnalystChat'
import { AgentAskChat } from './AgentAskChat'
import styles from './FloatingAskChat.module.css'

export type FloatingAskVariant = 'agent' | 'analyst'

export type FloatingAskChatProps = {
  variant: FloatingAskVariant
  matchId: string
  eventId?: string | null
  /** Human-readable label for the selected moment (minute · type · player). */
  eventLabel?: string | null
  match?: MatchSummary
  analysis?: DecisionAnalysis
  narrativeState?: DecisionNarrativeState
  /** Required for agent (fan) mode — grounded ask API conversation. */
  askCrewState?: AskCrewState
  onAskQuestion?: (question: string) => void
  onAskRetry?: () => void
  onClearAsk?: () => void
}

export function FloatingAskChat({
  variant,
  matchId,
  eventId,
  eventLabel,
  match,
  analysis,
  narrativeState,
  askCrewState,
  onAskQuestion,
  onAskRetry,
  onClearAsk,
}: FloatingAskChatProps) {
  const { t, locale } = useLocale()
  const [open, setOpen] = useState(false)
  const [clearSignal, setClearSignal] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const titleId = useId()

  const launcherLabel =
    variant === 'agent'
      ? t('floatingAskAgentLauncher')
      : t('floatingAskAnalystLauncher')
  const title =
    variant === 'agent' ? t('floatingAskAgentTitle') : t('analystTitle')
  const subtitle =
    variant === 'agent' ? t('floatingAskAgentSubtitle') : t('analystSubtitle')

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        launcherRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  function toggleOpen() {
    setOpen((current) => {
      const next = !current
      if (!next) queueMicrotask(() => launcherRef.current?.focus())
      return next
    })
  }

  function requestClear() {
    if (variant === 'agent') {
      if (!onClearAsk) return
      const hasContent =
        askCrewState != null &&
        (askCrewState.turns.length > 0 || askCrewState.status !== 'idle')
      if (!hasContent) return
      if (window.confirm(t('floatingAskClearConfirm'))) onClearAsk()
      return
    }
    if (window.confirm(t('floatingAskClearConfirm'))) {
      setClearSignal((value) => value + 1)
    }
  }

  const body: ReactNode =
    variant === 'agent' ? (
      askCrewState && onAskQuestion ? (
        <AgentAskChat
          askCrewState={askCrewState}
          onAskQuestion={onAskQuestion}
          onAskRetry={onAskRetry}
          onClear={onClearAsk}
          eventId={eventId}
          eventLabel={eventLabel}
          hideClear
          focusComposer={open}
        />
      ) : (
        <p className={styles.subtitle} role="status" style={{ padding: '1rem' }}>
          {t('askCrewUnavailableNeedsAskApi')}
        </p>
      )
    ) : eventId ? (
      <DecisionAnalystChat
        matchId={matchId}
        eventId={eventId}
        match={match}
        analysis={analysis}
        narrativeState={narrativeState}
        layout="bare"
        eventLabel={eventLabel}
        clearSignal={clearSignal}
        focusComposer={open}
      />
    ) : (
      <p className={styles.subtitle} role="status" style={{ padding: '1rem' }}>
        {t('floatingAskSelectDecision')}
      </p>
    )

  const node = (
    <div
      ref={rootRef}
      className={styles.root}
      data-testid="floating-ask-chat"
      data-variant={variant}
      data-open={open ? 'true' : 'false'}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Keep the panel mounted while closed so conversation state persists. */}
      <section
        id={panelId}
        className={`${styles.panel} ${open ? '' : styles.panelHidden}`.trim()}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-hidden={!open}
        // Keep mounted while closed so conversation state persists for the page session.
        // Use panelHidden (not only the HTML hidden attr): author `display:flex` overrides [hidden].
        hidden={!open}
        data-testid="floating-ask-panel"
      >
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <p className={styles.subtitle}>{subtitle}</p>
            {eventLabel ? (
              <p className={styles.context} role="status">
                <span className={styles.contextStrong}>
                  {t('floatingAskContext')}
                </span>
                <span>{eventLabel}</span>
              </p>
            ) : null}
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={requestClear}
              aria-label={t('askCrewClear')}
              title={t('askCrewClear')}
              data-testid="floating-ask-clear"
            >
              <span aria-hidden="true">⌫</span>
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => {
                setOpen(false)
                launcherRef.current?.focus()
              }}
              aria-label={t('floatingAskClose')}
              data-testid="floating-ask-close"
            >
              <X aria-hidden="true" size={16} strokeWidth={2.25} />
            </button>
          </div>
        </header>
        <div className={styles.body}>{body}</div>
      </section>

      <button
        ref={launcherRef}
        type="button"
        className={`${styles.launcher} ${open ? styles.launcherOpen : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggleOpen}
        data-testid="floating-ask-launcher"
      >
        <MessageCircle className={styles.launcherIcon} aria-hidden="true" />
        <span className={styles.launcherLabel}>{launcherLabel}</span>
      </button>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(node, document.body)
}
