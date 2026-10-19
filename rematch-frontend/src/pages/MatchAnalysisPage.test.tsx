import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STRINGS } from '../i18n/strings'
import * as matchServices from '../services/matches'
import { renderWithProviders } from '../test/render'
import { MatchAnalysisPage } from './MatchAnalysisPage'

afterEach(() => {
  cleanup()
  window.localStorage.setItem('rematch.locale', 'en')
  vi.restoreAllMocks()
})

function renderAnalysis(matchId: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/matches/:matchId" element={<MatchAnalysisPage />} />
      <Route
        path="/matches/:matchId/decisions/:eventId"
        element={<div>Decision placeholder</div>}
      />
      <Route path="/dashboard" element={<div>Dashboard</div>} />
    </Routes>,
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

    expect(screen.getByText(/Synthetic demo data/i)).toBeInTheDocument()
    expect(screen.getByText(/rematch-phase2-v1/i)).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: STRINGS.en.matchAnalysisPitchLabel }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('event-path')).toBeInTheDocument()

    expect(
      screen.getByRole('option', { name: /Pass at 12', Selected/i }),
    ).toHaveAttribute('aria-selected', 'true')

    expect(screen.getByText(STRINGS.en.matchAnalysisInspector)).toBeInTheDocument()
    expect(screen.getByText(/Jamie Cole/i)).toBeInTheDocument()
    expect(
      screen.getByText(STRINGS.en.matchAnalysisDecisionHint),
    ).toBeInTheDocument()
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
      screen.getByText(STRINGS.en.matchAnalysisTimelineEmpty),
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

  it('surfaces missing frame data honestly', async () => {
    renderAnalysis('m-oakwood-silvermere-2403')
    await waitForAnalysisReady(/Oakwood Wanderers/i)

    expect(screen.getByText(STRINGS.en.matchAnalysisNoFrames)).toBeInTheDocument()
    expect(screen.getByText(/No player frame for this moment/i)).toBeInTheDocument()
    expect(screen.queryByTestId('player-marker')).not.toBeInTheDocument()

    const inspector = screen.getByLabelText(STRINGS.en.matchAnalysisInspector)
    expect(within(inspector).getAllByText(STRINGS.en.matchAnalysisMissing).length).toBeGreaterThan(
      0,
    )
  })
})
