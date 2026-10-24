import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePersona } from '../context/PersonaContext'
import { useLocale } from '../i18n/locale'
import { STRINGS } from '../i18n/strings'
import * as matchServices from '../services/matches'
import { renderWithProviders } from '../test/render'
import { MatchAnalysisPage } from './MatchAnalysisPage'

beforeEach(() => {
  window.localStorage.setItem(
    'rematch.persona.v1',
    JSON.stringify({
      mode: 'fan',
      favoriteTeamId: null,
      favoritePlayerId: null,
      playerFocusId: null,
    }),
  )
})

afterEach(() => {
  cleanup()
  window.localStorage.setItem('rematch.locale', 'en')
  window.localStorage.setItem(
    'rematch.persona.v1',
    JSON.stringify({
      mode: 'fan',
      favoriteTeamId: null,
      favoritePlayerId: null,
      playerFocusId: null,
    }),
  )
  vi.restoreAllMocks()
})

function ModeSwitch() {
  const { mode, setMode } = usePersona()
  const { t } = useLocale()
  return (
    <div
      role="group"
      aria-label={t('modeSwitchLabel')}
      data-testid="persona-mode-switch"
    >
      <button
        type="button"
        aria-pressed={mode === 'fan'}
        onClick={() => setMode('fan')}
        data-testid="persona-mode-fan"
      >
        {t('modeFan')}
      </button>
      <button
        type="button"
        aria-pressed={mode === 'analyst'}
        onClick={() => setMode('analyst')}
        data-testid="persona-mode-analyst"
      >
        {t('modeAnalyst')}
      </button>
    </div>
  )
}

function renderAnalysis(matchId: string) {
  return renderWithProviders(
    <>
      <ModeSwitch />
      <Routes>
        <Route path="/matches/:matchId" element={<MatchAnalysisPage />} />
        <Route
          path="/matches/:matchId/decisions/:eventId"
          element={<div>Decision placeholder</div>}
        />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </>,
    { initialEntries: [`/matches/${matchId}`] },
  )
}

async function waitForAnalysisReady(teamName: RegExp) {
  await waitFor(() => {
    expect(screen.getAllByText(teamName).length).toBeGreaterThan(0)
  })
}

describe('MatchAnalysisPage', () => {
  it('loads a known match with events, pitch, and selected event details', async () => {
    renderAnalysis('m-northgate-riverside-2401')
    await waitForAnalysisReady(/Northgate FC/i)

    expect(screen.getByTestId('match-view-fan')).toBeInTheDocument()
    expect(screen.getByText(/Synthetic demo data/i)).toBeInTheDocument()
    expect(screen.getByText(/rematch-phase2-v1/i)).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: STRINGS.en.matchAnalysisPitchLabel }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('event-path')).toBeInTheDocument()

    expect(screen.getByTestId('match-studio-panel')).toBeInTheDocument()
    expect(screen.getByTestId('match-highlights')).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: /Pass at 12', Selected/i }),
    ).toHaveAttribute('aria-selected', 'true')

    expect(screen.getAllByText(/Jamie Cole/i).length).toBeGreaterThan(0)
    expect(
      screen.getByRole('link', { name: STRINGS.en.matchAnalysisDecisionCta }),
    ).toHaveAttribute(
      'href',
      '/matches/m-northgate-riverside-2401/decisions/evt-ng-pass-12',
    )
  })

  it('navigates Previous/Next through actual events and disables at ends', async () => {
    const user = userEvent.setup()
    renderAnalysis('m-northgate-riverside-2401')
    await waitForAnalysisReady(/Northgate FC/i)

    const prev = screen.getByRole('button', {
      name: STRINGS.en.matchAnalysisPrevEvent,
    })
    const next = screen.getByRole('button', {
      name: STRINGS.en.matchAnalysisNextEvent,
    })

    expect(prev).toBeDisabled()
    expect(next).toBeEnabled()

    await user.click(next)
    expect(
      screen.getByRole('option', { name: /Shot at 23', Selected/i }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(prev).toBeEnabled()

    // Advance to the last event
    while (!next.hasAttribute('disabled')) {
      await user.click(next)
    }

    expect(next).toBeDisabled()
    expect(prev).toBeEnabled()
    expect(
      screen.getByRole('option', { name: /Carry at 64', Selected/i }),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('handles matches with no events without crashing', async () => {
    renderAnalysis('m-lakeside-ironford-2405')
    await waitForAnalysisReady(/Lakeside Town/i)

    expect(
      screen.getByText(STRINGS.en.matchStudioLiveEmpty),
    ).toBeInTheDocument()
    expect(
      screen.getByText(STRINGS.en.matchAnalysisEmptyEventsHint),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: STRINGS.en.matchAnalysisPitchLabel }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('player-marker')).not.toBeInTheDocument()
    expect(screen.queryByTestId('event-location')).not.toBeInTheDocument()
  })

  it('shows not-found for unknown match ids', async () => {
    renderAnalysis('does-not-exist')

    expect(
      await screen.findByText(STRINGS.en.matchAnalysisNotFoundTitle),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: STRINGS.en.matchAnalysisBack }),
    ).toHaveAttribute('href', '/dashboard')
  })

  it('shows service errors with retry', async () => {
    const user = userEvent.setup()
    const getMatchById = vi
      .spyOn(matchServices.matchService, 'getMatchById')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        id: 'm-northgate-riverside-2401',
        competition: 'Metro Premier Cup',
        homeTeam: { id: 'team-northgate', name: 'Northgate FC', shortName: 'NGFC' },
        awayTeam: {
          id: 'team-riverside',
          name: 'Riverside United',
          shortName: 'RIV',
        },
        status: 'live',
        kickoffAt: '2026-10-18T18:00:00.000Z',
        score: { home: 1, away: 1 },
        minute: 67,
        provenance: 'synthetic',
        scenarioId: 'rematch-phase2-v1',
      })

    vi.spyOn(matchServices.matchService, 'getMatchEvents').mockResolvedValue([])
    vi.spyOn(matchServices.matchService, 'getMatchPlayers').mockResolvedValue([])
    vi.spyOn(matchServices.matchService, 'getMatchFrames').mockResolvedValue([])

    renderAnalysis('m-northgate-riverside-2401')

    expect(
      await screen.findByText(STRINGS.en.matchAnalysisErrorTitle),
    ).toBeInTheDocument()
    expect(screen.getByText(/network down/i)).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: STRINGS.en.matchAnalysisRetry }),
    )

    await waitForAnalysisReady(/Northgate FC/i)
    expect(getMatchById).toHaveBeenCalledTimes(2)
  })

  it('surfaces missing frame data honestly and derives motion from events', async () => {
    renderAnalysis('m-oakwood-silvermere-2403')
    await waitForAnalysisReady(/Oakwood Wanderers/i)

    expect(
      screen.getByText(STRINGS.en.matchAnalysisEventDerivedMotion),
    ).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.matchSimDisclaimer)).toBeInTheDocument()
    expect(screen.getByTestId('simulation-legend')).toBeInTheDocument()
    // Event-derived markers from verified pass/shot/tackle coordinates — not frames.
    expect(screen.getAllByTestId('player-marker').length).toBeGreaterThan(0)
    expect(screen.getByTestId('match-studio-panel')).toBeInTheDocument()
  })

  it('syncs momentum chart, replay timeline, and LIVE feed with event selection and play/pause', async () => {
    const user = userEvent.setup()
    renderAnalysis('m-northgate-riverside-2401')
    await waitForAnalysisReady(/Northgate FC/i)

    expect(screen.getByTestId('match-momentum-chart')).toBeInTheDocument()
    expect(screen.getByTestId('match-replay-timeline')).toBeInTheDocument()
    expect(screen.getByTestId('match-studio-live')).toBeInTheDocument()
    expect(screen.getByTestId('replay-ht-marker')).toBeInTheDocument()
    expect(screen.getByTestId('momentum-ht-label')).toBeInTheDocument()

    const next = screen.getByRole('button', {
      name: STRINGS.en.matchAnalysisNextEvent,
    })
    await user.click(next)

    expect(
      screen.getByRole('option', { name: /Shot at 23', Selected/i }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('replay-position')).toHaveTextContent(/\d+\/\d+/)

    await user.click(screen.getByRole('button', { name: STRINGS.en.replayPlay }))
    expect(
      screen.getByRole('button', { name: STRINGS.en.replayPause }),
    ).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: STRINGS.en.replayPause }))
    expect(
      screen.getByRole('button', { name: STRINGS.en.replayPlay }),
    ).toHaveAttribute('aria-pressed', 'false')

    await user.click(
      screen.getByRole('button', { name: STRINGS.en.replayModeHighlights }),
    )
    expect(
      screen.getByRole('button', { name: STRINGS.en.replayModeHighlights }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('LIVE selection syncs replay and ASK can request the event narrative endpoint', async () => {
    const user = userEvent.setup()
    const getDecisionNarrative = vi
      .spyOn(matchServices.matchService, 'getDecisionNarrative')
      .mockRejectedValue(
        new matchServices.DecisionNarrativeUnavailableError(
          'Mock mode has no backend narrative.',
          'm-northgate-riverside-2401',
          'evt-ng-shot-23',
        ),
      )

    renderAnalysis('m-northgate-riverside-2401')
    await waitForAnalysisReady(/Northgate FC/i)

    await user.click(screen.getByRole('option', { name: /Shot at 23'/i }))
    expect(
      screen.getByRole('option', { name: /Shot at 23', Selected/i }),
    ).toHaveAttribute('aria-selected', 'true')

    await user.click(
      screen.getByRole('tab', { name: STRINGS.en.matchStudioTabAsk }),
    )
    await user.click(
      screen.getByRole('button', {
        name: STRINGS.en.matchStudioAskSelectedEvent,
      }),
    )

    await waitFor(() => {
      expect(getDecisionNarrative).toHaveBeenCalledWith(
        'm-northgate-riverside-2401',
        'evt-ng-shot-23',
      )
    })
    expect(
      await screen.findByText(/backend narrative is unavailable/i),
    ).toBeInTheDocument()
  })

  it('defaults to Fan View with highlights and section tabs, not a long analytics dump', async () => {
    renderAnalysis('m-northgate-riverside-2401')
    await waitForAnalysisReady(/Northgate FC/i)

    expect(screen.getByTestId('match-view-fan')).toBeInTheDocument()
    expect(screen.getByTestId('match-highlights')).toBeInTheDocument()
    expect(screen.getByTestId('match-fan-secondary')).toBeInTheDocument()
    expect(screen.getByTestId('fan-tab-overview')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByTestId('match-key-metrics')).toBeInTheDocument()
    expect(screen.queryByTestId('match-view-analyst')).not.toBeInTheDocument()
    expect(screen.queryByTestId('match-centre-networks')).not.toBeInTheDocument()
  })

  it('switches to a distinct Analysis View while preserving match, event, and playback', async () => {
    const user = userEvent.setup()
    renderAnalysis('m-northgate-riverside-2401')
    await waitForAnalysisReady(/Northgate FC/i)

    await user.click(screen.getByRole('option', { name: /Shot at 23'/i }))
    expect(
      screen.getByRole('option', { name: /Shot at 23', Selected/i }),
    ).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByTestId('persona-mode-analyst'))

    expect(screen.getByTestId('match-view-analyst')).toBeInTheDocument()
    expect(screen.queryByTestId('match-view-fan')).not.toBeInTheDocument()
    expect(screen.getByTestId('match-analysis-workspace')).toBeInTheDocument()
    expect(screen.getByTestId('analysis-region-decisions')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      screen.getByRole('option', { name: /Shot at 23', Selected/i }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('match-sim-stage')).toBeInTheDocument()
    expect(screen.getByTestId('match-studio-panel')).toBeInTheDocument()

    await user.click(screen.getByTestId('analysis-region-flow'))
    expect(screen.getByTestId('match-momentum-chart')).toBeInTheDocument()
    expect(screen.getByTestId('match-centre-shot-race')).toBeInTheDocument()

    await user.click(screen.getByTestId('persona-mode-fan'))
    expect(screen.getByTestId('match-view-fan')).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: /Shot at 23', Selected/i }),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('seeks the shared replay clock from a highlight chip', async () => {
    const user = userEvent.setup()
    renderAnalysis('m-northgate-riverside-2401')
    await waitForAnalysisReady(/Northgate FC/i)

    const highlight = screen.getByTestId('match-highlight-evt-ng-shot-23')
    await user.click(highlight)

    expect(highlight).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('option', { name: /Shot at 23', Selected/i }),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('exposes keyboard-operable Fan section tabs and Analysis region tabs', async () => {
    const user = userEvent.setup()
    renderAnalysis('m-northgate-riverside-2401')
    await waitForAnalysisReady(/Northgate FC/i)

    const overview = screen.getByTestId('fan-tab-overview')
    overview.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByTestId('fan-tab-events')).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await user.click(screen.getByTestId('persona-mode-analyst'))
    const decisions = screen.getByTestId('analysis-region-decisions')
    decisions.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByTestId('analysis-region-flow')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('renders Arabic Fan View copy without inventing analytics labels', async () => {
    window.localStorage.setItem('rematch.locale', 'ar')
    renderAnalysis('m-northgate-riverside-2401')
    await waitForAnalysisReady(/Northgate FC/i)

    expect(screen.getByTestId('match-view-fan')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
    expect(
      screen.getByRole('tab', { name: STRINGS.ar.matchFanTabOverview }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: STRINGS.ar.matchHighlightsTitle }),
    ).toBeInTheDocument()
  })
})
