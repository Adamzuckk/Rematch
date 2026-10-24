import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STRINGS } from '../i18n/strings'
import { matchService } from '../services/matches'
import type { MatchIntelligence } from '../types'
import { renderWithProviders } from '../test/render'
import { InsightsPage } from './InsightsPage'

const firstIntelligence: MatchIntelligence = {
  matchId: 'm-northgate-riverside-2401',
  provenance: 'synthetic',
  source: 'seeded_events_only',
  eventCounts: { pass: 3 },
  totalEvents: 3,
  eventsWithCoordinates: 3,
  alignedFrames: 1,
  pathMetricsPresent: 1,
  avgBallSpeedMps: 11.2,
  avgShotSpeedMps: null,
  avgPassDistanceM: 17.4,
  keyMoments: [
    {
      eventId: 'evt-ng-pass-12',
      type: 'pass',
      minute: 12,
      second: null,
      hasAlignedFrame: true,
      hasPathMetrics: true,
      label: "pass @ 12'",
    },
  ],
  limitations: ['Synthetic data only.'],
}

const secondIntelligence: MatchIntelligence = {
  ...firstIntelligence,
  matchId: 'm-oakwood-silvermere-2403',
  totalEvents: 7,
  keyMoments: [],
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.setItem('rematch.locale', 'en')
})

function renderInsights(initialMatchId = 'm-northgate-riverside-2401') {
  return renderWithProviders(
    <Routes>
      <Route
        path="/matches/:matchId/insights"
        element={
          <>
            <Link to="/matches/m-oakwood-silvermere-2403/insights">
              Switch insights match
            </Link>
            <InsightsPage />
          </>
        }
      />
      <Route path="/matches/:matchId" element={<div>Match</div>} />
    </Routes>,
    { initialEntries: [`/matches/${initialMatchId}/insights`] },
  )
}

describe('InsightsPage', () => {
  it('announces the loading state while intelligence is pending', () => {
    let resolveIntelligence: ((value: MatchIntelligence | null) => void) | undefined
    vi.spyOn(matchService, 'getMatchIntelligence').mockImplementation(
      () =>
        new Promise<MatchIntelligence | null>((resolve) => {
          resolveIntelligence = resolve
        }),
    )

    renderInsights()

    expect(screen.getByRole('status')).toHaveTextContent(STRINGS.en.insightsLoading)
    resolveIntelligence?.(firstIntelligence)
  })

  it('renders only shared-service API intelligence values', async () => {
    const getMatchIntelligence = vi
      .spyOn(matchService, 'getMatchIntelligence')
      .mockResolvedValue(firstIntelligence)

    renderInsights()

    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(screen.getByText('11.2')).toBeInTheDocument()
    expect(screen.getByText("pass @ 12' · frame-backed")).toBeInTheDocument()
    expect(getMatchIntelligence).toHaveBeenCalledWith('m-northgate-riverside-2401')
  })

  it('shows an honest unavailable state in mock mode', async () => {
    renderInsights()

    expect(await screen.findByText(STRINGS.en.insightsMockTitle)).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.insightsMockBody)).toBeInTheDocument()
  })

  it('keeps API errors visible and retries the same shared-service request', async () => {
    const user = userEvent.setup()
    const getMatchIntelligence = vi
      .spyOn(matchService, 'getMatchIntelligence')
      .mockRejectedValueOnce(new Error('intelligence offline'))
      .mockResolvedValueOnce(firstIntelligence)

    renderInsights()

    expect(await screen.findByText(STRINGS.en.insightsErrorTitle)).toBeInTheDocument()
    expect(screen.getByText(/intelligence offline/i)).toBeInTheDocument()
    expect(screen.queryByText(STRINGS.en.insightsMockTitle)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: STRINGS.en.insightsRetry }))
    expect(await screen.findByText('11.2')).toBeInTheDocument()
    expect(getMatchIntelligence).toHaveBeenCalledTimes(2)
  })

  it('reloads intelligence when the route match changes', async () => {
    const user = userEvent.setup()
    const getMatchIntelligence = vi
      .spyOn(matchService, 'getMatchIntelligence')
      .mockResolvedValueOnce(firstIntelligence)
      .mockResolvedValueOnce(secondIntelligence)

    renderInsights()
    expect(await screen.findByText('3')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Switch insights match' }))

    expect(await screen.findByText('7')).toBeInTheDocument()
    expect(getMatchIntelligence).toHaveBeenNthCalledWith(
      2,
      'm-oakwood-silvermere-2403',
    )
  })

  it('localizes the mock state and preserves RTL direction', async () => {
    window.localStorage.setItem('rematch.locale', 'ar')
    renderInsights()

    expect(await screen.findByText(STRINGS.ar.insightsMockTitle)).toBeInTheDocument()
    expect(screen.getByText(STRINGS.ar.insightsMockBody)).toBeInTheDocument()
    expect(document.documentElement.dir).toBe('rtl')
  })

  it('localizes an API-backed insight view in Arabic', async () => {
    window.localStorage.setItem('rematch.locale', 'ar')
    vi.spyOn(matchService, 'getMatchIntelligence').mockResolvedValue(firstIntelligence)

    renderInsights()

    expect(
      await screen.findByRole('heading', {
        name: new RegExp(STRINGS.ar.insightsTitle),
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(STRINGS.ar.insightsSummaryHeading)).toBeInTheDocument()
    expect(document.documentElement.dir).toBe('rtl')
  })
})
