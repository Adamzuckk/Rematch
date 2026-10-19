import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STRINGS } from '../i18n/strings'
import * as matchServices from '../services/matches'
import {
  DecisionInsufficientEvidenceError,
  DecisionNotFoundError,
  MatchApiError,
} from '../services/matches'
import type { DecisionAnalysis } from '../types'
import { renderWithProviders } from '../test/render'
import { DecisionExplorerPage } from './DecisionExplorerPage'

afterEach(() => {
  cleanup()
  window.localStorage.setItem('rematch.locale', 'en')
  vi.restoreAllMocks()
})

function renderExplorer(matchId: string, eventId: string) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/matches/:matchId/decisions/:eventId"
        element={<DecisionExplorerPage />}
      />
      <Route path="/matches/:matchId" element={<div>Match analysis</div>} />
      <Route path="/dashboard" element={<div>Dashboard</div>} />
    </Routes>,
    { initialEntries: [`/matches/${matchId}/decisions/${eventId}`] },
  )
}

const SAMPLE_ANALYSIS: DecisionAnalysis = {
  matchId: 'm-northgate-riverside-2401',
  eventId: 'evt-ng-carry-64',
  eventType: 'carry',
  teamId: 'team-northgate',
  playerId: 'player-northgate-11',
  isHomeTeam: true,
  scoringMethodId: 'geometric_progression_v1',
  scoringMethodVersion: '1.0.0',
  scoringAssumptions: ['Home team attacks toward x=100; away toward x=0.'],
  observed: {
    actionId: 'observed:evt-ng-carry-64',
    kind: 'observed_carry',
    label: 'Observed carry',
    start: { x: 35, y: 30 },
    end: { x: 52, y: 44 },
    targetPlayerId: null,
    metrics: [
      {
        name: 'composite_score',
        status: 'available',
        value: 36.63,
        unit: 'pitch_percent',
        formula: 'progressive + proximity',
        inputs: {},
      },
    ],
    compositeScore: 36.63,
    rankable: true,
    limitations: [],
  },
  alternatives: [
    {
      actionId: 'alt-pass:evt-ng-carry-64:player-northgate-9',
      kind: 'hypothetical_pass',
      label: 'Hypothetical pass to player-northgate-9',
      start: { x: 35, y: 30 },
      end: { x: 68, y: 55 },
      targetPlayerId: 'player-northgate-9',
      metrics: [
        {
          name: 'composite_score',
          status: 'available',
          value: 68.62,
          unit: 'pitch_percent',
          formula: 'progressive + proximity',
          inputs: {},
        },
      ],
      compositeScore: 68.62,
      rankable: true,
      limitations: [],
    },
  ],
  ranking: [
    {
      rank: 2,
      actionId: 'observed:evt-ng-carry-64',
      kind: 'observed_carry',
      label: 'Observed carry',
      compositeScore: 36.63,
      targetPlayerId: null,
      rankable: true,
    },
    {
      rank: 1,
      actionId: 'alt-pass:evt-ng-carry-64:player-northgate-9',
      kind: 'hypothetical_pass',
      label: 'Hypothetical pass to player-northgate-9',
      compositeScore: 68.62,
      targetPlayerId: 'player-northgate-9',
      rankable: true,
    },
  ],
  claims: [
    {
      id: 'c-verified',
      statement: 'Observed carry has a geometric composite score.',
      status: 'verified',
      evidence: [
        {
          kind: 'event',
          id: 'evt-ng-carry-64',
          matchId: 'm-northgate-riverside-2401',
          detail: null,
        },
      ],
      reason: 'Event and calculation present.',
      limitations: [],
      calculation: null,
    },
    {
      id: 'c-partial',
      statement: 'Alternatives cover every plausible option.',
      status: 'partially_supported',
      evidence: [
        {
          kind: 'frame',
          id: 'frm-ng-64',
          matchId: 'm-northgate-riverside-2401',
          detail: null,
        },
      ],
      reason: 'Frame exists but enumeration is not exhaustive.',
      limitations: ['No lane model.'],
      calculation: null,
    },
    {
      id: 'c-unsupported',
      statement: 'Higher score means the objectively correct decision.',
      status: 'unsupported',
      evidence: [],
      reason: 'Geometry is not decision correctness.',
      limitations: [],
      calculation: null,
    },
  ],
  completeness: {
    level: 'complete',
    hasCoordinates: true,
    hasAlignedFrame: true,
    teammatePositionsInFrame: 2,
    opponentPositionsInFrame: 1,
    alternativeCount: 1,
    missing: [],
    notes: [],
  },
  confidence: 'high',
  limitations: [
    'Higher geometric score does not establish a better real-world football decision.',
  ],
  context: {
    playerName: 'Leo Park',
    outcome: null,
    minute: 64,
    frameId: 'frm-ng-64',
  },
  provenance: 'synthetic',
}

describe('DecisionExplorerPage', () => {
  it('renders a valid decision analysis with observed action and ranking', async () => {
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue(
      SAMPLE_ANALYSIS,
    )
    vi.spyOn(matchServices.matchService, 'getMatchById').mockResolvedValue(null)

    renderExplorer('m-northgate-riverside-2401', 'evt-ng-carry-64')

    await waitFor(() => {
      expect(screen.getByText(STRINGS.en.decisionTitle)).toBeInTheDocument()
    })

    expect(screen.getAllByText(/^Observed carry$/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/36\.63/).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/Hypothetical pass to player-northgate-9/i).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(/#1/)).toBeInTheDocument()
    expect(screen.getByText(/#2/)).toBeInTheDocument()
    expect(
      screen.getByText(STRINGS.en.decisionRankingNote),
    ).toBeInTheDocument()
    expect(
      screen.getByText(STRINGS.en.decisionScoringExplainer),
    ).toBeInTheDocument()
  })

  it('displays all three evidence statuses with readable labels', async () => {
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue(
      SAMPLE_ANALYSIS,
    )
    vi.spyOn(matchServices.matchService, 'getMatchById').mockResolvedValue(null)

    renderExplorer('m-northgate-riverside-2401', 'evt-ng-carry-64')

    await waitFor(() => {
      expect(
        screen.getByText(STRINGS.en.decisionClaimsHeading),
      ).toBeInTheDocument()
    })

    const claimsRegion = screen
      .getByText(STRINGS.en.decisionClaimsHeading)
      .closest('section')
    expect(claimsRegion).not.toBeNull()
    const statuses = within(claimsRegion!).getAllByRole('status')
    const labels = statuses.map((node) => node.getAttribute('aria-label'))
    expect(labels).toEqual(
      expect.arrayContaining([
        STRINGS.en.decisionClaimVerified,
        STRINGS.en.decisionClaimPartial,
        STRINGS.en.decisionClaimUnsupported,
      ]),
    )
  })

  it('shows insufficient-evidence without inventing scores', async () => {
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockRejectedValue(
      new DecisionInsufficientEvidenceError(
        "Event type 'pressure' is not a decision candidate.",
        'm-northgate-riverside-2401',
        'evt-ng-pressure-41',
      ),
    )

    renderExplorer('m-northgate-riverside-2401', 'evt-ng-pressure-41')

    await waitFor(() => {
      expect(
        screen.getByText(STRINGS.en.decisionInsufficientTitle),
      ).toBeInTheDocument()
    })

    expect(
      screen.getByText(/Event type 'pressure' is not a decision candidate/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/36\.63/)).not.toBeInTheDocument()
  })

  it('handles 404 event not found', async () => {
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockRejectedValue(
      new DecisionNotFoundError(
        'event_not_found',
        'Event not found: evt-missing',
        'm-northgate-riverside-2401',
        'evt-missing',
      ),
    )

    renderExplorer('m-northgate-riverside-2401', 'evt-missing')

    await waitFor(() => {
      expect(
        screen.getByText(STRINGS.en.decisionNotFoundTitle),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByText(STRINGS.en.decisionNotFoundEvent),
    ).toBeInTheDocument()
  })

  it('handles 404 match not found', async () => {
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockRejectedValue(
      new DecisionNotFoundError(
        'match_not_found',
        'Match not found: m-missing',
        'm-missing',
      ),
    )

    renderExplorer('m-missing', 'evt-ng-carry-64')

    await waitFor(() => {
      expect(
        screen.getByText(STRINGS.en.decisionNotFoundMatch),
      ).toBeInTheDocument()
    })
  })

  it('handles network errors with retry', async () => {
    const user = userEvent.setup()
    const spy = vi
      .spyOn(matchServices.matchService, 'getDecisionAnalysis')
      .mockRejectedValueOnce(
        new MatchApiError('Failed to reach match API: network request failed'),
      )
      .mockResolvedValueOnce(SAMPLE_ANALYSIS)

    renderExplorer('m-northgate-riverside-2401', 'evt-ng-carry-64')

    await waitFor(() => {
      expect(
        screen.getByText(STRINGS.en.decisionErrorTitle),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByText(new RegExp(STRINGS.en.decisionNetworkHint)),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: STRINGS.en.decisionRetry }),
    )

    await waitFor(() => {
      expect(screen.getByText(STRINGS.en.decisionTitle)).toBeInTheDocument()
    })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('shows empty alternatives and missing-frame completeness honestly', async () => {
    const emptyAlts: DecisionAnalysis = {
      ...SAMPLE_ANALYSIS,
      alternatives: [],
      ranking: [
        {
          rank: 1,
          actionId: 'observed:evt-ng-carry-64',
          kind: 'observed_carry',
          label: 'Observed carry',
          compositeScore: 36.63,
          targetPlayerId: null,
          rankable: true,
        },
      ],
      completeness: {
        ...SAMPLE_ANALYSIS.completeness,
        level: 'partial',
        hasAlignedFrame: false,
        alternativeCount: 0,
        missing: ['aligned_frame'],
      },
      confidence: 'low',
      context: { ...SAMPLE_ANALYSIS.context, mockFixture: true },
    }
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue(
      emptyAlts,
    )

    renderExplorer('m-northgate-riverside-2401', 'evt-ng-carry-64')

    await waitFor(() => {
      expect(
        screen.getByText(STRINGS.en.decisionAlternativesEmpty),
      ).toBeInTheDocument()
    })
    expect(screen.getByText(STRINGS.en.decisionMockBanner)).toBeInTheDocument()
    expect(screen.getByText(/aligned_frame/i)).toBeInTheDocument()
  })

  it('loads mock-mode fixture for a known synthetic event', async () => {
    renderExplorer('m-northgate-riverside-2401', 'evt-ng-pass-12')

    await waitFor(() => {
      expect(screen.getByText(STRINGS.en.decisionTitle)).toBeInTheDocument()
    })

    expect(screen.getAllByText(/^Observed pass$/i).length).toBeGreaterThan(0)
    expect(screen.getByText(STRINGS.en.decisionMockBanner)).toBeInTheDocument()
    expect(
      screen.getByText(STRINGS.en.decisionProvenanceSynthetic),
    ).toBeInTheDocument()
    expect(
      screen.getByText(STRINGS.en.decisionAlternativesEmpty),
    ).toBeInTheDocument()
  })

  it('renders Arabic labels including RTL document direction', async () => {
    window.localStorage.setItem('rematch.locale', 'ar')
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue(
      SAMPLE_ANALYSIS,
    )

    renderExplorer('m-northgate-riverside-2401', 'evt-ng-carry-64')

    await waitFor(() => {
      expect(screen.getByText(STRINGS.ar.decisionTitle)).toBeInTheDocument()
    })

    expect(document.documentElement.dir).toBe('rtl')
    expect(screen.getByText(STRINGS.ar.decisionClaimVerified)).toBeInTheDocument()
    expect(
      screen.getByText(STRINGS.ar.decisionRankingNote),
    ).toBeInTheDocument()
  })
})
