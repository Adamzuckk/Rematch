import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EventInspector } from '../components/match/EventInspector'
import { EventTimeline } from '../components/match/EventTimeline'
import { MatchHeader } from '../components/match/MatchHeader'
import { FootballPitch } from '../components/pitch/FootballPitch'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { useMatchAnalysis } from '../hooks/useMatchAnalysis'
import { useLocale } from '../i18n/locale'
import {
  resolveFrameForEvent,
  sortMatchEvents,
} from '../lib/pitch'
import styles from './MatchAnalysisPage.module.css'

export function MatchAnalysisPage() {
  const { matchId } = useParams()
  const { t, locale } = useLocale()
  const { state, retry } = useMatchAnalysis(matchId)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const events = state.status === 'ready' ? state.events : null
  const sortedEvents = useMemo(
    () => (events ? sortMatchEvents(events) : []),
    [events],
  )

  // Derive selection synchronously so the first paint with data is correct
  // (avoids a null frame between ready state and an effect flush).
  const resolvedSelectedId =
    selectedEventId && sortedEvents.some((event) => event.id === selectedEventId)
      ? selectedEventId
      : (sortedEvents[0]?.id ?? null)

  const selectedIndex = sortedEvents.findIndex(
    (event) => event.id === resolvedSelectedId,
  )
  const selectedEvent =
    selectedIndex >= 0 ? (sortedEvents[selectedIndex] ?? null) : null
  const canPrevious = selectedIndex > 0
  const canNext =
    selectedIndex >= 0 && selectedIndex < sortedEvents.length - 1

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className={styles.page}>
        <p className={styles.loading} role="status" aria-live="polite">
          {t('matchAnalysisLoading')}
        </p>
      </div>
    )
  }

  if (state.status === 'not-found') {
    return (
      <div className={styles.page}>
        <EmptyState
          title={t('matchAnalysisNotFoundTitle')}
          description={t('matchAnalysisNotFound')}
          action={
            <Button variant="secondary" to="/dashboard">
              {t('matchAnalysisBack')}
            </Button>
          }
        />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className={styles.page}>
        <EmptyState
          title={t('matchAnalysisErrorTitle')}
          description={state.message}
          action={
            <Button variant="secondary" onClick={retry}>
              {t('matchAnalysisRetry')}
            </Button>
          }
        />
      </div>
    )
  }

  const { match, players, frames } = state
  const frame = resolveFrameForEvent(frames, selectedEvent)
  const hasFrames = frames.length > 0

  return (
    <div className={styles.page}>
      <MatchHeader
        match={match}
        versusLabel={t('versus')}
        scheduledLabel={t('scheduled')}
        locale={locale}
      />

      {!hasFrames ? (
        <p className={styles.notice} role="note">
          {t('matchAnalysisNoFrames')}
        </p>
      ) : null}

      {sortedEvents.length === 0 ? (
        <p className={styles.notice} role="status">
          {t('matchAnalysisEmptyEventsHint')}
        </p>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.pitchColumn}>
          <FootballPitch
            homeTeam={match.homeTeam}
            awayTeam={match.awayTeam}
            selectedEvent={selectedEvent}
            frame={frame}
            label={t('matchAnalysisPitchLabel')}
            locale={locale}
          />
        </div>

        <aside className={styles.inspectorColumn}>
          <EventInspector
            matchId={match.id}
            event={selectedEvent}
            homeTeam={match.homeTeam}
            awayTeam={match.awayTeam}
            players={players}
            frame={frame}
            labels={{
              heading: t('matchAnalysisInspector'),
              empty: t('matchAnalysisInspectorEmpty'),
              missing: t('matchAnalysisMissing'),
              decisionCta: t('matchAnalysisDecisionCta'),
              decisionHint: t('matchAnalysisDecisionHint'),
            }}
          />
        </aside>
      </div>

      <EventTimeline
        events={sortedEvents}
        selectedEventId={resolvedSelectedId}
        onSelect={setSelectedEventId}
        onPrevious={() => {
          if (!canPrevious) return
          const prev = sortedEvents[selectedIndex - 1]
          if (prev) setSelectedEventId(prev.id)
        }}
        onNext={() => {
          if (!canNext) return
          const next = sortedEvents[selectedIndex + 1]
          if (next) setSelectedEventId(next.id)
        }}
        canPrevious={canPrevious}
        canNext={canNext}
        locale={locale}
        labels={{
          heading: t('matchAnalysisTimeline'),
          empty: t('matchAnalysisTimelineEmpty'),
          previous: t('matchAnalysisPrevEvent'),
          next: t('matchAnalysisNextEvent'),
          selected: t('matchAnalysisSelected'),
        }}
      />
    </div>
  )
}
