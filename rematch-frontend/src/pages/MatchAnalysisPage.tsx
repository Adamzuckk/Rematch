import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EventInspector } from '../components/match/EventInspector'
import { EventTimeline } from '../components/match/EventTimeline'
import { MatchHeader } from '../components/match/MatchHeader'
import { FootballPitch } from '../components/pitch/FootballPitch'
import {
  BroadcastOverlay,
  buildTimedOverlayJson,
  type OverlayPayload,
} from '../components/overlay/BroadcastOverlay'
import {
  ReplayControls,
  type ReplaySpeed,
} from '../components/replay/ReplayControls'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { usePersona } from '../context/PersonaContext'
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
  const { mode, playerFocusId } = usePersona()
  const { state, retry } = useMatchAnalysis(matchId)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<ReplaySpeed>(1)
  const [showOverlay, setShowOverlay] = useState(true)

  const events = state.status === 'ready' ? state.events : null
  const sortedEvents = useMemo(
    () => (events ? sortMatchEvents(events) : []),
    [events],
  )

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

  useEffect(() => {
    if (!playing || sortedEvents.length === 0) return
    const ms = 1200 / speed
    const id = window.setInterval(() => {
      setSelectedEventId((current) => {
        const idx = sortedEvents.findIndex((e) => e.id === current)
        const nextIdx = idx < 0 ? 0 : Math.min(idx + 1, sortedEvents.length - 1)
        if (nextIdx >= sortedEvents.length - 1) {
          setPlaying(false)
        }
        return sortedEvents[nextIdx]?.id ?? current
      })
    }, ms)
    return () => window.clearInterval(id)
  }, [playing, speed, sortedEvents])

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
  const matchLabel = `${match.homeTeam.shortName ?? match.homeTeam.name} vs ${match.awayTeam.shortName ?? match.awayTeam.name}`

  const overlay: OverlayPayload | null = selectedEvent
    ? {
        matchLabel,
        minuteLabel: `${selectedEvent.minute ?? '?'}'`,
        eventType: selectedEvent.type,
        headline:
          mode === 'fan'
            ? t('overlayFanHeadline')
            : t('overlayAnalystHeadline'),
        detail:
          playerFocusId && selectedEvent.playerId === playerFocusId
            ? t('overlayPlayerFocus')
            : t('overlayDetail'),
        provenance: 'synthetic',
        tMs: Math.round((selectedEvent.minute ?? 0) * 60_000),
      }
    : null

  const downloadOverlayJson = () => {
    const items: OverlayPayload[] = sortedEvents.map((ev) => ({
      matchLabel,
      minuteLabel: `${ev.minute ?? '?'}'`,
      eventType: ev.type,
      headline: `${ev.type}`,
      detail: `event=${ev.id}`,
      provenance: 'synthetic',
      tMs: Math.round((ev.minute ?? 0) * 60_000),
    }))
    const blob = new Blob(
      [JSON.stringify(buildTimedOverlayJson(items), null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rematch-overlay-${match.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.page}>
      <MatchHeader
        match={match}
        versusLabel={t('versus')}
        scheduledLabel={t('scheduled')}
        locale={locale}
      />

      <ReplayControls
        playing={playing}
        speed={speed}
        index={Math.max(selectedIndex, 0)}
        total={sortedEvents.length}
        label={t('replayLabel')}
        playLabel={t('replayPlay')}
        pauseLabel={t('replayPause')}
        onTogglePlay={() => setPlaying((p) => !p)}
        onSpeed={setSpeed}
        onSeek={(i) => {
          const ev = sortedEvents[i]
          if (ev) setSelectedEventId(ev.id)
        }}
      />

      <div className={styles.toolbar}>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={showOverlay}
            onChange={(e) => setShowOverlay(e.target.checked)}
          />
          {t('overlayToggle')}
        </label>
        <button type="button" className={styles.linkish} onClick={downloadOverlayJson}>
          {t('overlayDownloadJson')}
        </button>
        <span className={styles.modeTag}>
          {mode === 'fan' ? t('modeFan') : t('modeAnalyst')}
        </span>
      </div>

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
        <div className={styles.pitchColumn} style={{ position: 'relative' }}>
          <FootballPitch
            homeTeam={match.homeTeam}
            awayTeam={match.awayTeam}
            selectedEvent={selectedEvent}
            frame={frame}
            label={t('matchAnalysisPitchLabel')}
            locale={locale}
          />
          <BroadcastOverlay payload={overlay} visible={showOverlay} />
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
