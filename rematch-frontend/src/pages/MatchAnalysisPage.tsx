import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { KeyMetricsStrip } from '../components/match/KeyMetricsStrip'
import { MatchCentre } from '../components/match/MatchCentre'
import { MatchHeader } from '../components/match/MatchHeader'
import { MatchHighlightsStrip } from '../components/match/MatchHighlightsStrip'
import { MatchMomentumChart } from '../components/match/MatchMomentumChart'
import { MatchStudioPanel } from '../components/match/MatchStudioPanel'
import { FootballPitch } from '../components/pitch/FootballPitch'
import { BroadcastOverlay } from '../components/overlay/BroadcastOverlay'
import {
  buildTimedOverlayJson,
  type OverlayPayload,
} from '../components/overlay/overlayPayload'
import {
  MatchReplayTimeline,
  type MatchReplaySpeed,
  type ReplayMode,
} from '../components/replay/MatchReplayTimeline'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { usePersona } from '../context/PersonaContext'
import { useDecisionNarrative } from '../hooks/useDecisionNarrative'
import { useMatchAnalysis } from '../hooks/useMatchAnalysis'
import {
  useMatchPlaybackClock,
  usePrefersReducedMotion,
} from '../hooks/useMatchPlaybackClock'
import { useLocale } from '../i18n/locale'
import type { MessageKey } from '../i18n/strings'
import { filterEventsForMode } from '../lib/matchReplay'
import {
  buildSimulationTimeline,
  sampleSimulation,
} from '../lib/matchSimulation'
import {
  isDecisionCandidate,
  resolveFrameForEvent,
  sortMatchEvents,
} from '../lib/pitch'
import type { DecisionNarrativeResponse, MatchEvent } from '../types'
import styles from './MatchAnalysisPage.module.css'

type FanSection = 'overview' | 'events' | 'team' | 'players'
type AnalysisRegion =
  | 'decisions'
  | 'flow'
  | 'teams'
  | 'players'
  | 'evidence'

const FAN_SECTIONS: { id: FanSection; labelKey: MessageKey }[] = [
  { id: 'overview', labelKey: 'matchFanTabOverview' },
  { id: 'events', labelKey: 'matchFanTabEvents' },
  { id: 'team', labelKey: 'matchFanTabTeamStats' },
  { id: 'players', labelKey: 'matchFanTabPlayers' },
]

const ANALYSIS_REGIONS: { id: AnalysisRegion; labelKey: MessageKey }[] = [
  { id: 'decisions', labelKey: 'matchAnalysisRegionDecisions' },
  { id: 'flow', labelKey: 'matchAnalysisRegionFlow' },
  { id: 'teams', labelKey: 'matchAnalysisRegionTeams' },
  { id: 'players', labelKey: 'matchAnalysisRegionPlayers' },
  { id: 'evidence', labelKey: 'matchAnalysisRegionEvidence' },
]

export function MatchAnalysisPage() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { t, locale } = useLocale()
  const { mode: personaMode, playerFocusId } = usePersona()
  const { state, retry } = useMatchAnalysis(matchId)
  const reducedMotion = usePrefersReducedMotion()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<MatchReplaySpeed>(1)
  const [replayMode, setReplayMode] = useState<ReplayMode>('full')
  const [showOverlay, setShowOverlay] = useState(true)
  const [askedDecisionKey, setAskedDecisionKey] = useState<string | null>(null)
  const [narrativeByEventId, setNarrativeByEventId] = useState<
    Record<string, DecisionNarrativeResponse>
  >({})
  const [seekGeneration, setSeekGeneration] = useState(0)
  const [studioOpen, setStudioOpen] = useState(true)
  const [fanSection, setFanSection] = useState<FanSection>('overview')
  const [analysisRegion, setAnalysisRegion] =
    useState<AnalysisRegion>('decisions')
  const fanTabsId = useId()
  const analysisTabsId = useId()

  const events = state.status === 'ready' ? state.events : null
  const sortedEvents = useMemo(
    () => (events ? sortMatchEvents(events) : []),
    [events],
  )
  const playbackEvents = useMemo(
    () => filterEventsForMode(sortedEvents, replayMode),
    [sortedEvents, replayMode],
  )

  const frames = useMemo(
    () => (state.status === 'ready' ? state.frames : []),
    [state],
  )
  const players = useMemo(
    () => (state.status === 'ready' ? state.players : []),
    [state],
  )

  const simulationTimeline = useMemo(
    () => buildSimulationTimeline(playbackEvents, frames, players),
    [playbackEvents, frames, players],
  )

  const resolvedSelectedId =
    selectedEventId &&
    playbackEvents.some((event) => event.id === selectedEventId)
      ? selectedEventId
      : (playbackEvents[0]?.id ?? null)

  const selectedIndex = playbackEvents.findIndex(
    (event) => event.id === resolvedSelectedId,
  )
  const selectedEvent =
    selectedIndex >= 0 ? (playbackEvents[selectedIndex] ?? null) : null
  const canPrevious = selectedIndex > 0
  const canNext =
    selectedIndex >= 0 && selectedIndex < playbackEvents.length - 1

  const seekEventIndex = Math.max(selectedIndex, 0)

  const { timeMs } = useMatchPlaybackClock({
    timeline: simulationTimeline,
    playing,
    speed,
    seekEventIndex,
    seekGeneration,
    onArriveEventIndex: (eventIndex) => {
      const next = playbackEvents[eventIndex]
      if (next) setSelectedEventId(next.id)
    },
    onPlaybackEnded: () => setPlaying(false),
  })

  const simState = useMemo(
    () =>
      sampleSimulation(simulationTimeline, timeMs, {
        reducedMotion,
      }),
    [simulationTimeline, timeMs, reducedMotion],
  )

  const decisionKey =
    matchId && selectedEvent ? `${matchId}:${selectedEvent.id}` : null
  const narrativeEnabled =
    askedDecisionKey != null &&
    decisionKey != null &&
    askedDecisionKey === decisionKey &&
    selectedEvent != null &&
    isDecisionCandidate(selectedEvent)

  const { state: narrativeState, retry: retryNarrative } = useDecisionNarrative(
    matchId,
    selectedEvent?.id,
    narrativeEnabled,
  )

  if (
    narrativeState.status === 'ready' &&
    narrativeByEventId[narrativeState.eventId] !== narrativeState.response
  ) {
    setNarrativeByEventId({
      ...narrativeByEventId,
      [narrativeState.eventId]: narrativeState.response,
    })
  }

  const openDecision = (eventId: string) => {
    if (!matchId) return
    const event = sortedEvents.find((item) => item.id === eventId)
    if (!event || !isDecisionCandidate(event)) return
    setPlaying(false)
    navigate(`/matches/${matchId}/decisions/${eventId}`)
  }

  const selectEvent = (eventId: string) => {
    setSelectedEventId(eventId)
    setPlaying(false)
    setSeekGeneration((generation) => generation + 1)
  }

  const askSelectedEvent = () => {
    if (!matchId || !selectedEvent || !isDecisionCandidate(selectedEvent)) return
    setAskedDecisionKey(`${matchId}:${selectedEvent.id}`)
  }

  const clearAsk = () => {
    setAskedDecisionKey(null)
  }

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

  const { match } = state
  const frame = resolveFrameForEvent(frames, selectedEvent)
  const hasFrames = frames.length > 0
  const matchLabel = `${match.homeTeam.shortName ?? match.homeTeam.name} vs ${match.awayTeam.shortName ?? match.awayTeam.name}`
  const playheadMinute = simState.minute
  const clockMinuteLabel =
    Number.isFinite(playheadMinute) ? `${Math.floor(playheadMinute)}'` : '—'
  const scoreHome = match.score?.home ?? 0
  const scoreAway = match.score?.away ?? 0
  const isFan = personaMode === 'fan'

  const overlay: OverlayPayload | null = selectedEvent
    ? {
        matchLabel,
        minuteLabel: `${selectedEvent.minute ?? '?'}'`,
        eventType: selectedEvent.type,
        headline: isFan ? t('overlayFanHeadline') : t('overlayAnalystHeadline'),
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

  const simulationView =
    simState.players.length > 0 || simState.ball
      ? {
          players: simState.players,
          ball: simState.ball,
          showLabels: !reducedMotion || simState.players.length <= 6,
        }
      : null

  const onReplayMode = (nextMode: ReplayMode) => {
    setReplayMode(nextMode)
    setPlaying(false)
    const nextEvents = filterEventsForMode(sortedEvents, nextMode)
    if (
      selectedEventId &&
      !nextEvents.some((event) => event.id === selectedEventId)
    ) {
      setSelectedEventId(nextEvents[0]?.id ?? null)
    }
    setSeekGeneration((generation) => generation + 1)
  }

  const studio = (
    <MatchStudioPanel
      matchId={match.id}
      events={playbackEvents}
      selectedEventId={resolvedSelectedId}
      selectedEvent={selectedEvent}
      homeTeam={match.homeTeam}
      awayTeam={match.awayTeam}
      players={players}
      canPrevious={canPrevious}
      canNext={canNext}
      onSelectEvent={selectEvent}
      onPrevious={() => {
        if (!canPrevious) return
        const prev = playbackEvents[selectedIndex - 1]
        if (prev) selectEvent(prev.id)
      }}
      onNext={() => {
        if (!canNext) return
        const next = playbackEvents[selectedIndex + 1]
        if (next) selectEvent(next.id)
      }}
      onOpenDecision={openDecision}
      onDownloadReport={downloadOverlayJson}
      narrativeState={narrativeState}
      onAskSelectedEvent={askSelectedEvent}
      onNarrativeRetry={retryNarrative}
      onClearAsk={clearAsk}
      narrativeByEventId={narrativeByEventId}
      compact={isFan}
      defaultTab="live"
    />
  )

  const pitchStage = (
    <div className={styles.simStage} data-testid="match-sim-stage">
      <div className={styles.simHud} data-testid="match-sim-hud">
        <div className={styles.hudScore} aria-live="polite">
          <span className={styles.hudTeam}>
            {match.homeTeam.shortName ?? match.homeTeam.name}
          </span>
          <span className={styles.hudDigits}>
            {scoreHome}–{scoreAway}
          </span>
          <span className={styles.hudTeam}>
            {match.awayTeam.shortName ?? match.awayTeam.name}
          </span>
        </div>
        <div className={styles.hudMeta}>
          <span className={styles.hudMinute}>{clockMinuteLabel}</span>
          <span className={styles.hudStatus}>
            {match.status}
            {playing ? ` · ${t('replayPlay')}` : ''}
          </span>
        </div>
        <p className={styles.hudNote} role="note">
          {t('matchSimDisclaimer')}
        </p>
      </div>

      <div className={styles.pitchWrap} style={{ position: 'relative' }}>
        <FootballPitch
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
          selectedEvent={selectedEvent}
          frame={simulationView ? null : frame}
          simulation={simulationView}
          label={t('matchAnalysisPitchLabel')}
          locale={locale}
          className={isFan ? styles.pitchDominant : styles.pitchAnalysis}
        />
        <BroadcastOverlay payload={overlay} visible={showOverlay} />
      </div>

      <MatchReplayTimeline
        match={match}
        events={playbackEvents}
        selectedEventId={resolvedSelectedId}
        playheadMinute={playheadMinute}
        playing={playing}
        speed={speed}
        mode={replayMode}
        onTogglePlay={() => setPlaying((value) => !value)}
        onSpeed={setSpeed}
        onMode={onReplayMode}
        onSelectEvent={selectEvent}
        onOpenDecision={openDecision}
        onSeekIndex={(index) => {
          const event = playbackEvents[index]
          if (event) selectEvent(event.id)
        }}
      />
    </div>
  )

  const notices = (
    <>
      {!hasFrames && simulationTimeline.hasEventDerivedMotion ? (
        <p className={styles.notice} role="note">
          {t('matchAnalysisEventDerivedMotion')}
        </p>
      ) : null}
      {!hasFrames && !simulationTimeline.hasEventDerivedMotion ? (
        <p className={styles.notice} role="note">
          {t('matchAnalysisNoFrames')}
        </p>
      ) : null}
      {sortedEvents.length === 0 ? (
        <p className={styles.notice} role="status">
          {t('matchAnalysisEmptyEventsHint')}
        </p>
      ) : null}
    </>
  )

  const toolbar = (
    <div className={styles.toolbar}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={showOverlay}
          onChange={(e) => setShowOverlay(e.target.checked)}
        />
        {t('overlayToggle')}
      </label>
      <button
        type="button"
        className={styles.linkish}
        onClick={downloadOverlayJson}
      >
        {t('overlayDownloadJson')}
      </button>
      <button
        type="button"
        className={styles.studioToggle}
        aria-expanded={studioOpen}
        aria-controls="match-studio-aside"
        onClick={() => setStudioOpen((open) => !open)}
      >
        {studioOpen ? t('matchStudioCollapse') : t('matchStudioExpand')}
      </button>
      <span className={styles.modeTag} data-testid="match-view-badge">
        {isFan ? t('matchFanViewBadge') : t('matchAnalysisViewBadge')}
      </span>
    </div>
  )

  const onTabListKeyDown = <T extends string>(
    event: KeyboardEvent<HTMLDivElement>,
    ids: readonly T[],
    current: T,
    setCurrent: (next: T) => void,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = ids.indexOf(current)
    if (index < 0) return
    const forward =
      locale === 'ar' ? event.key === 'ArrowLeft' : event.key === 'ArrowRight'
    const nextIndex = forward
      ? (index + 1) % ids.length
      : (index - 1 + ids.length) % ids.length
    setCurrent(ids[nextIndex]!)
  }

  if (isFan) {
    return (
      <div
        className={[styles.page, styles.fanPage].join(' ')}
        data-testid="match-view-fan"
        data-view="fan"
      >
        <MatchHeader
          match={match}
          versusLabel={t('versus')}
          scheduledLabel={t('scheduled')}
          locale={locale}
          compact
          viewBadge={t('matchFanViewBadge')}
        />

        <MatchHighlightsStrip
          events={sortedEvents}
          selectedEventId={resolvedSelectedId}
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
          players={players}
          onSelectEvent={selectEvent}
        />

        <div className={styles.fanLayout}>
          <div className={styles.pitchColumn}>
            {pitchStage}
            {toolbar}
            {notices}
          </div>

          <aside
            id="match-studio-aside"
            className={[
              styles.inspectorColumn,
              studioOpen ? styles.studioOpen : styles.studioCollapsed,
            ].join(' ')}
          >
            {studio}
          </aside>
        </div>

        <section
          className={styles.secondary}
          aria-label={t('matchFanTablist')}
          data-testid="match-fan-secondary"
        >
          <div
            className={styles.sectionTabs}
            role="tablist"
            aria-label={t('matchFanTablist')}
            onKeyDown={(event) =>
              onTabListKeyDown(
                event,
                FAN_SECTIONS.map((item) => item.id),
                fanSection,
                setFanSection,
              )
            }
          >
            {FAN_SECTIONS.map((item) => {
              const selected = fanSection === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`${fanTabsId}-${item.id}`}
                  aria-selected={selected}
                  aria-controls={`${fanTabsId}-panel-${item.id}`}
                  tabIndex={selected ? 0 : -1}
                  className={selected ? styles.sectionTabActive : styles.sectionTab}
                  onClick={() => setFanSection(item.id)}
                  data-testid={`fan-tab-${item.id}`}
                >
                  {t(item.labelKey)}
                </button>
              )
            })}
          </div>

          <div
            role="tabpanel"
            id={`${fanTabsId}-panel-${fanSection}`}
            aria-labelledby={`${fanTabsId}-${fanSection}`}
            className={styles.sectionPanel}
            data-testid={`fan-panel-${fanSection}`}
          >
            {fanSection === 'overview' ? (
              <div className={styles.stack}>
                <p className={styles.sectionHint}>{t('matchFanOverviewHint')}</p>
                <KeyMetricsStrip match={match} events={sortedEvents} />
                <MatchMomentumChart
                  match={match}
                  events={sortedEvents}
                  selectedEventId={resolvedSelectedId}
                  playheadMinute={playheadMinute}
                  onSelectEvent={selectEvent}
                  onOpenDecision={openDecision}
                />
              </div>
            ) : null}
            {fanSection === 'events' ? (
              <div className={styles.stack}>
                <p className={styles.sectionHint}>{t('matchFanEventsHint')}</p>
                <MatchMomentumChart
                  match={match}
                  events={sortedEvents}
                  selectedEventId={resolvedSelectedId}
                  playheadMinute={playheadMinute}
                  onSelectEvent={selectEvent}
                  onOpenDecision={openDecision}
                />
              </div>
            ) : null}
            {fanSection === 'team' ? (
              <MatchCentre
                match={match}
                events={sortedEvents}
                players={players}
                frames={frames}
                sections={['comparison']}
                hideHeader
                dense
                expandableAdvanced
              />
            ) : null}
            {fanSection === 'players' ? (
              <div className={styles.stack}>
                <MatchCentre
                  match={match}
                  events={sortedEvents}
                  players={players}
                  frames={frames}
                  sections={['players']}
                  hideHeader
                  dense
                />
                <MatchCentre
                  match={match}
                  events={sortedEvents}
                  players={players}
                  frames={frames}
                  sections={['networks', 'squad']}
                  hideHeader
                  dense
                  expandableAdvanced
                />
              </div>
            ) : null}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div
      className={[styles.page, styles.analysisPage].join(' ')}
      data-testid="match-view-analyst"
      data-view="analyst"
    >
      <MatchHeader
        match={match}
        versusLabel={t('versus')}
        scheduledLabel={t('scheduled')}
        locale={locale}
        compact
        viewBadge={t('matchAnalysisViewBadge')}
      />

      <div className={styles.analysisLayout}>
        <div className={styles.pitchColumn}>
          {pitchStage}
          {toolbar}
          {notices}
        </div>

        <aside
          id="match-studio-aside"
          className={[
            styles.inspectorColumn,
            styles.analysisStudio,
            studioOpen ? styles.studioOpen : styles.studioCollapsed,
          ].join(' ')}
        >
          {studio}
        </aside>
      </div>

      <section
        className={styles.analysisWorkspace}
        aria-label={t('matchAnalysisRegionTablist')}
        data-testid="match-analysis-workspace"
      >
        <div
          className={styles.sectionTabs}
          role="tablist"
          aria-label={t('matchAnalysisRegionTablist')}
          onKeyDown={(event) =>
            onTabListKeyDown(
              event,
              ANALYSIS_REGIONS.map((item) => item.id),
              analysisRegion,
              setAnalysisRegion,
            )
          }
        >
          {ANALYSIS_REGIONS.map((item) => {
            const selected = analysisRegion === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`${analysisTabsId}-${item.id}`}
                aria-selected={selected}
                aria-controls={`${analysisTabsId}-panel-${item.id}`}
                tabIndex={selected ? 0 : -1}
                className={
                  selected ? styles.sectionTabActive : styles.sectionTab
                }
                onClick={() => setAnalysisRegion(item.id)}
                data-testid={`analysis-region-${item.id}`}
              >
                {t(item.labelKey)}
              </button>
            )
          })}
        </div>

        <div
          role="tabpanel"
          id={`${analysisTabsId}-panel-${analysisRegion}`}
          aria-labelledby={`${analysisTabsId}-${analysisRegion}`}
          className={styles.sectionPanel}
          data-testid={`analysis-panel-${analysisRegion}`}
        >
          {analysisRegion === 'decisions' ? (
            <AnalysisDecisionsRegion
              hint={t('matchAnalysisRegionDecisionsHint')}
              selectedEvent={selectedEvent}
              onOpenDecision={openDecision}
              decisionCta={t('matchAnalysisDecisionCta')}
              decisionHint={t('matchAnalysisDecisionHint')}
              missing={t('matchAnalysisMissing')}
            />
          ) : null}

          {analysisRegion === 'flow' ? (
            <div className={styles.stack}>
              <p className={styles.sectionHint}>
                {t('matchAnalysisRegionFlowHint')}
              </p>
              <p className={styles.provenanceChip}>{t('matchDataCalculated')}</p>
              <MatchMomentumChart
                match={match}
                events={sortedEvents}
                selectedEventId={resolvedSelectedId}
                playheadMinute={playheadMinute}
                onSelectEvent={selectEvent}
                onOpenDecision={openDecision}
              />
              <MatchCentre
                match={match}
                events={sortedEvents}
                players={players}
                frames={frames}
                sections={['shotRace']}
                hideHeader
                dense
              />
            </div>
          ) : null}

          {analysisRegion === 'teams' ? (
            <div className={styles.stack}>
              <p className={styles.sectionHint}>
                {t('matchAnalysisRegionTeamsHint')}
              </p>
              <MatchCentre
                match={match}
                events={sortedEvents}
                players={players}
                frames={frames}
                sections={['comparison', 'networks']}
                hideHeader
                dense
              />
            </div>
          ) : null}

          {analysisRegion === 'players' ? (
            <div className={styles.stack}>
              <p className={styles.sectionHint}>
                {t('matchAnalysisRegionPlayersHint')}
              </p>
              <MatchCentre
                match={match}
                events={sortedEvents}
                players={players}
                frames={frames}
                sections={['players', 'squad']}
                hideHeader
                dense
                sortablePlayers
              />
            </div>
          ) : null}

          {analysisRegion === 'evidence' ? (
            <div className={styles.stack}>
              <p className={styles.sectionHint}>
                {t('matchAnalysisRegionEvidenceHint')}
              </p>
              <ul className={styles.provenanceList}>
                <li>{t('matchDataMeasured')}</li>
                <li>{t('matchDataCalculated')}</li>
                <li>{t('matchDataEstimate')}</li>
              </ul>
              <p className={styles.sectionHint}>{t('matchStudioLiveHint')}</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function AnalysisDecisionsRegion({
  hint,
  selectedEvent,
  onOpenDecision,
  decisionCta,
  decisionHint,
  missing,
}: {
  hint: string
  selectedEvent: MatchEvent | null
  onOpenDecision: (eventId: string) => void
  decisionCta: string
  decisionHint: string
  missing: string
}) {
  const candidate =
    selectedEvent != null && isDecisionCandidate(selectedEvent)
      ? selectedEvent
      : null

  return (
    <div className={styles.stack} data-testid="analysis-decisions-region">
      <p className={styles.sectionHint}>{hint}</p>
      <div className={styles.decisionCard}>
        <p className={styles.decisionMeta}>
          {candidate
            ? `${candidate.type} · ${candidate.minute ?? missing}'`
            : missing}
        </p>
        <p className={styles.sectionHint}>{decisionHint}</p>
        {candidate ? (
          <Button
            variant="primary"
            onClick={() => onOpenDecision(candidate.id)}
          >
            {decisionCta}
          </Button>
        ) : (
          <p className={styles.unavailable} role="status">
            {decisionHint}
          </p>
        )}
      </div>
    </div>
  )
}
