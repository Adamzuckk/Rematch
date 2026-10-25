import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DecisionExplorerPanel } from '../components/decision/DecisionExplorerPanel'
import { STRINGS } from '../i18n/strings'
import { SYNTHETIC_DECISION_ANALYSES } from '../mocks/decisionAnalysis'
import * as matchServices from '../services/matches'
import type {
  ActionScore,
  DecisionNarrativeResponse,
  EventIntelligence,
  MatchFrame,
  MatchSummary,
} from '../types'
import { renderWithProviders } from '../test/render'
import { DecisionExplorerPage } from './DecisionExplorerPage'

function setPersonaMode(mode: 'fan' | 'analyst') {
  window.localStorage.setItem(
    'rematch.persona.v1',
    JSON.stringify({
      mode,
      favoriteTeamId: null,
      favoritePlayerId: null,
      playerFocusId: null,
    }),
  )
}

afterEach(() => {
  cleanup()
  window.localStorage.setItem('rematch.locale', 'en')
  setPersonaMode('fan')
  vi.restoreAllMocks()
})

const base = SYNTHETIC_DECISION_ANALYSES[
  'm-northgate-riverside-2401::evt-ng-carry-64'
]!

const firstPass: ActionScore = {
  actionId: 'alt-pass:evt-ng-carry-64:player-northgate-8',
  kind: 'hypothetical_pass',
  label: 'Hypothetical pass to player-northgate-8',
  start: { x: 20, y: 40 },
  end: { x: 40, y: 50 },
  targetPlayerId: 'player-northgate-8',
  metrics: [],
  compositeScore: 68.621,
  rankable: true,
  limitations: ['Frame-backed geometric comparison only.'],
}

const secondPass: ActionScore = {
  ...firstPass,
  actionId: 'alt-pass:evt-ng-carry-64:player-northgate-9',
  label: 'Hypothetical pass to player-northgate-9',
  end: { x: 60, y: 35 },
  targetPlayerId: 'player-northgate-9',
  compositeScore: 41.257,
}

const analysis = {
  ...base,
  alternatives: [firstPass, secondPass],
  ranking: [
    {
      rank: 1,
      actionId: firstPass.actionId,
      kind: firstPass.kind,
      label: firstPass.label,
      compositeScore: firstPass.compositeScore,
      targetPlayerId: firstPass.targetPlayerId,
      rankable: true,
    },
    {
      rank: 2,
      actionId: secondPass.actionId,
      kind: secondPass.kind,
      label: secondPass.label,
      compositeScore: secondPass.compositeScore,
      targetPlayerId: secondPass.targetPlayerId,
      rankable: true,
    },
    ...base.ranking,
  ],
  claims: [
    ...base.claims,
    {
      id: `claim-alt-score:${firstPass.actionId}`,
      statement: 'Backend returned a geometric comparison for this hypothetical path.',
      status: 'verified' as const,
      evidence: [],
      reason: 'The candidate endpoint is present in the aligned frame.',
      limitations: ['Does not predict pass completion.'],
      calculation: { value: firstPass.compositeScore, unit: 'pitch_percent' },
    },
    {
      id: `claim-alt-score:${secondPass.actionId}`,
      statement: 'Backend returned a geometric comparison for this hypothetical path.',
      status: 'verified' as const,
      evidence: [],
      reason: 'The candidate endpoint is present in the aligned frame.',
      limitations: ['Does not predict pass completion.'],
      calculation: { value: secondPass.compositeScore, unit: 'pitch_percent' },
    },
  ],
}

const match: MatchSummary = {
  id: base.matchId,
  competition: 'Synthetic Demo League',
  homeTeam: { id: 'team-northgate', name: 'Northgate FC', shortName: 'NGFC' },
  awayTeam: { id: 'team-riverside', name: 'Riverside United', shortName: 'RIV' },
  status: 'finished',
  kickoffAt: '2026-10-19T18:00:00.000Z',
  provenance: 'synthetic',
  scenarioId: 'rematch-phase8-v1',
}

const frame: MatchFrame = {
  id: 'frame-carry-64',
  matchId: base.matchId,
  eventId: base.eventId,
  players: [
    { playerId: 'player-northgate-8', teamId: 'team-northgate', position: { x: 40, y: 50 } },
    { playerId: 'player-northgate-9', teamId: 'team-northgate', position: { x: 60, y: 35 } },
    { playerId: 'player-riverside-1', teamId: 'team-riverside', position: { x: 70, y: 50 } },
  ],
  provenance: 'synthetic',
}

const narrativeResponse: DecisionNarrativeResponse = {
  matchId: base.matchId,
  eventId: base.eventId,
  provenance: 'synthetic',
  analysis: base,
  verificationResults: [
    {
      claimId: 'claim-observed-score',
      submittedStatement: 'A score was returned.',
      evidenceValidationStatus: 'verified',
      claimSupportStatus: 'not_assessed',
      reason: 'References exist.',
      evidence: [],
      limitations: ['Natural-language claim truth was not assessed.'],
      validationMethod: 'match_event_evidence_catalog_v1',
      validationScope:
        'evidence_reference_membership_and_registered_calculation_consistency',
    },
  ],
  narrative: {
    matchId: base.matchId,
    eventId: base.eventId,
    provenance: 'synthetic',
    english: {
      headline: 'Northgate FC vs Riverside United: Carry decision',
      keyObservations: ['The backend returned a geometric score.'],
      limitations: ['Synthetic match data only.'],
    },
    arabic: {
      headline: 'نورثغيت ضد ريفرسايد: تحليل حمل الكرة',
      keyObservations: ['أعاد الخادم نتيجة هندسية.'],
      limitations: ['بيانات مباراة اصطناعية فقط.'],
    },
  },
}

describe('DecisionExplorerPanel Pick Your Pass', () => {
  it('selects and changes an eligible backend candidate, highlighting its path and returned values', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <DecisionExplorerPanel analysis={analysis} match={match} frame={frame} />,
    )

    const select = screen.getByRole('combobox', {
      name: STRINGS.en.pickPassSelect,
    })
    await user.selectOptions(select, firstPass.actionId)

    let selectedPath = screen.getByTestId('selected-pass-path')
    expect(selectedPath).toHaveAttribute('x1', '210')
    expect(selectedPath).toHaveAttribute('x2', '420')
    expect(screen.getByTestId('pick-pass-result')).toHaveTextContent('68.62')
    expect(screen.getByTestId('pick-pass-result')).toHaveTextContent('#1')
    expect(screen.getByText(/Observed action score: 36.63/)).toBeInTheDocument()
    expect(
      within(screen.getByTestId('pick-pass-result')).getByText(
        /Backend returned a geometric comparison/,
      ),
    ).toBeInTheDocument()

    await user.selectOptions(select, secondPass.actionId)
    selectedPath = screen.getByTestId('selected-pass-path')
    expect(selectedPath).toHaveAttribute('x2', '630')
    expect(screen.getByTestId('pick-pass-result')).toHaveTextContent('41.26')
    expect(screen.getByTestId('pick-pass-result')).toHaveTextContent('#2')

    await user.click(
      screen.getByRole('button', { name: STRINGS.en.pickPassReset }),
    )
    expect(screen.queryByTestId('selected-pass-path')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pick-pass-result')).not.toBeInTheDocument()
  })

  it('shows unavailable alternatives honestly when mock frames are absent', () => {
    const mockAnalysis = SYNTHETIC_DECISION_ANALYSES[
      'm-northgate-riverside-2401::evt-ng-carry-64'
    ]!
    renderWithProviders(<DecisionExplorerPanel analysis={mockAnalysis} />)

    expect(screen.getByText(STRINGS.en.pickPassUnavailable)).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.getByText(STRINGS.en.pickPassSynthetic)).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('does not expose alternatives whose path coordinates are missing', () => {
    const withoutCoordinates = {
      ...analysis,
      alternatives: [{ ...firstPass, start: null, end: null }],
    }
    renderWithProviders(
      <DecisionExplorerPanel analysis={withoutCoordinates} match={match} frame={frame} />,
    )

    expect(
      screen.getByText(STRINGS.en.pickPassMissingCoordinates),
    ).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByTestId('selected-pass-path')).not.toBeInTheDocument()
  })

  it('renders Arabic labels and switches the document direction to RTL', async () => {
    window.localStorage.setItem('rematch.locale', 'ar')
    renderWithProviders(<DecisionExplorerPanel analysis={analysis} />)

    expect(
      screen.getByRole('heading', {
        name: `${STRINGS.ar.decisionTitle} ${STRINGS.ar.decisionTitleAccent}`,
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(STRINGS.ar.pickPassSelect)).toBeInTheDocument()
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('dir', 'rtl')
      expect(document.documentElement).toHaveAttribute('lang', 'ar')
    })
  })

  it('renders backend-returned English and Arabic narrative without treating reference checks as claim truth', async () => {
    setPersonaMode('analyst')
    renderWithProviders(
      <DecisionExplorerPanel
        analysis={analysis}
        narrativeState={{
          status: 'ready',
          matchId: base.matchId,
          eventId: base.eventId,
          response: narrativeResponse,
        }}
      />,
    )

    expect(
      screen.getByRole('heading', { name: STRINGS.en.decisionPipelineHeading }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: STRINGS.en.decisionPipelineSummaryHeading,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.decisionPipelineSummary)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: STRINGS.en.decisionPipelineMatchAgent }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: STRINGS.en.decisionPipelineVerifierAgent }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: STRINGS.en.decisionPipelineNarratorAgent }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(STRINGS.en.decisionClaimSupportNotAssessed),
    ).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.decisionPipelineVerifierNote)).toBeInTheDocument()
    expect(screen.getByTestId('decision-advanced-tools')).not.toHaveAttribute('open')
    expect(screen.getByTestId('decision-ranking-disclosure')).not.toHaveAttribute('open')
    expect(screen.getByTestId('decision-ask-agents-disclosure')).not.toHaveAttribute('open')
    expect(screen.queryByTestId('decision-analyst-chat-disclosure')).not.toBeInTheDocument()
    expect(screen.getByTestId('floating-ask-chat')).toBeInTheDocument()
    expect(screen.getByTestId('floating-ask-launcher')).toHaveTextContent(
      STRINGS.en.floatingAskAnalystLauncher,
    )
    expect(screen.getByTestId('decision-analyst-chat')).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.decisionPipelineFooter)).toBeInTheDocument()
    expect(screen.getAllByText(STRINGS.en.decisionPipelineKeyPoints)).toHaveLength(2)
    expect(screen.getAllByText(STRINGS.en.decisionPipelineLimitation)).toHaveLength(2)

    const englishNarrative = within(screen.getByTestId('decision-narrative-content'))
    expect(englishNarrative.getByText(narrativeResponse.narrative.english.headline)).toBeInTheDocument()
    expect(englishNarrative.getByText('The backend returned a geometric score.')).toBeInTheDocument()
    expect(englishNarrative.getByText('Synthetic match data only.')).toBeInTheDocument()
    // Pipeline narrator and Ask the Agents both surface the same backend headline.
    expect(
      screen.getAllByText(narrativeResponse.narrative.english.headline).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(STRINGS.en.askAgentsTruthScope)).toBeInTheDocument()
    expect(screen.getByTestId('ask-agents-narrative-content')).toBeInTheDocument()
    expect(screen.getAllByText(/Narrative provenance: Synthetic data/).length).toBeGreaterThan(0)

    window.localStorage.setItem('rematch.locale', 'ar')
    setPersonaMode('analyst')
    cleanup()
    renderWithProviders(
      <DecisionExplorerPanel
        analysis={analysis}
        narrativeState={{
          status: 'ready',
          matchId: base.matchId,
          eventId: base.eventId,
          response: narrativeResponse,
        }}
      />,
    )
    await waitFor(() => {
      expect(
        within(screen.getByTestId('decision-narrative-content')).getByText(
          narrativeResponse.narrative.arabic.headline,
        ),
      ).toBeInTheDocument()
      expect(screen.getByText(STRINGS.ar.decisionPipelineVerifierNote)).toBeInTheDocument()
      expect(
        screen.getAllByText(narrativeResponse.narrative.arabic.headline).length,
      ).toBeGreaterThan(0)
      expect(screen.getByText(STRINGS.ar.askAgentsTruthScope)).toBeInTheDocument()
    })
  })

  it('keeps Fan view focused on briefing and Pick Your Pass without the analyst pipeline', () => {
    setPersonaMode('fan')
    renderWithProviders(
      <DecisionExplorerPanel
        analysis={analysis}
        narrativeState={{ status: 'idle' }}
        onAskAgents={() => undefined}
      />,
    )

    expect(screen.getByTestId('decision-view-fan')).toBeInTheDocument()
    expect(screen.getByTestId('decision-moment-briefing')).toBeInTheDocument()
    expect(screen.getByTestId('decision-briefing-empty')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: STRINGS.en.decisionPipelineHeading }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: STRINGS.en.askAgentsHeading }),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('decision-advanced-tools')).not.toBeInTheDocument()
    expect(screen.queryByTestId('decision-ranking-disclosure')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: STRINGS.en.pickPassHeading }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('floating-ask-launcher')).toHaveTextContent(
      STRINGS.en.floatingAskAgentLauncher,
    )
  })

  it('explains mock briefing unavailability without fabricating content', () => {
    setPersonaMode('fan')
    renderWithProviders(
      <DecisionExplorerPanel
        analysis={analysis}
        intelligenceState={{
          status: 'unavailable',
          matchId: base.matchId,
          eventId: base.eventId,
          message: 'Event intelligence is unavailable in mock mode.',
        }}
      />,
    )

    const empty = screen.getByTestId('decision-briefing-empty')
    expect(empty).toHaveTextContent(STRINGS.en.decisionIntelUnavailable)
    expect(empty).toHaveTextContent(STRINGS.en.decisionIntelEmptyHint)
    expect(empty).toHaveTextContent('Event intelligence is unavailable in mock mode.')
  })

  it('surfaces event intelligence tiers and LLM honesty when disconnected', () => {
    setPersonaMode('fan')
    renderWithProviders(
      <DecisionExplorerPanel
        analysis={analysis}
        intelligenceState={{
          status: 'ready',
          matchId: base.matchId,
          eventId: base.eventId,
          intelligence: {
            matchId: base.matchId,
            eventId: base.eventId,
            eventType: 'carry',
            provenance: 'synthetic',
            analysisMethod: 'deterministic_event_intelligence_v1',
            llmConnected: false,
            decisionCandidate: true,
            english: {
              headline: 'Carry at 64′',
              keyObservations: ['A carry was recorded.'],
              limitations: ['Synthetic fixture.'],
              whatHappened: ['The match log records a carry.'],
              whyItMattered: ['It progressed play in the final third.'],
              whatCouldHaveHappened: ['A pass alternative scored higher geometrically.'],
            },
            arabic: {
              headline: 'حمل الكرة في 64′',
              keyObservations: ['سُجّل حمل للكرة.'],
              limitations: ['تركيب اصطناعي.'],
              whatHappened: ['يسجّل سجل المباراة حمل الكرة.'],
              whyItMattered: ['تقدّم اللعب في الثلث الأخير.'],
              whatCouldHaveHappened: ['بديل تمريرة سجّل أعلى هندسياً.'],
            },
            statements: [
              {
                tier: 'fact',
                english: 'At minute 64, the match log records a carry.',
                arabic: 'في الدقيقة 64 يسجّل السجل حمل الكرة.',
              },
              {
                tier: 'hypothesis',
                english: 'A higher-scoring pass alternative exists under the method.',
                arabic: 'يوجد بديل تمريرة أعلى درجة وفق الطريقة.',
              },
            ],
            missingEvidence: [],
            limitations: ['Deterministic templates only.'],
            decisionAnalysis: null,
          },
        }}
      />,
    )

    expect(screen.getByText(STRINGS.en.decisionLlmDisconnected)).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.decisionWhatHappened)).toBeInTheDocument()
    expect(screen.getByText('The match log records a carry.')).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.decisionTierFact)).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.decisionTierHypothesis)).toBeInTheDocument()
  })

  it('shows LLM connected copy only when the API sets llmConnected true', () => {
    setPersonaMode('fan')
    renderWithProviders(
      <DecisionExplorerPanel
        analysis={analysis}
        intelligenceState={{
          status: 'ready',
          matchId: base.matchId,
          eventId: base.eventId,
          intelligence: {
            matchId: base.matchId,
            eventId: base.eventId,
            eventType: 'pass',
            provenance: 'synthetic',
            analysisMethod: 'llm_grounded_event_intelligence_v1',
            llmConnected: true,
            decisionCandidate: true,
            english: {
              headline: 'Enriched pass briefing',
              keyObservations: ['Grounded observation.'],
              limitations: ['Verified evidence only.'],
              whatHappened: ['A pass was recorded.'],
              whyItMattered: ['Geometry favoured progression.'],
              whatCouldHaveHappened: ['Hypothesis: another target ranked higher.'],
            },
            arabic: {
              headline: 'إحاطة تمريرة مُثرَاة',
              keyObservations: ['ملاحظة مبنية على الأدلة.'],
              limitations: ['أدلة موثّقة فقط.'],
              whatHappened: ['سُجّلت تمريرة.'],
              whyItMattered: ['الهندسة فضّلت التقدّم.'],
              whatCouldHaveHappened: ['فرضية: هدف آخر أعلى ترتيباً.'],
            },
            statements: [],
            missingEvidence: [],
            limitations: ['Provider enriched wording from verified evidence.'],
            decisionAnalysis: null,
          },
        }}
      />,
    )

    expect(screen.getByText(STRINGS.en.decisionLlmConnected)).toBeInTheDocument()
    expect(screen.queryByText(STRINGS.en.decisionLlmDisconnected)).not.toBeInTheDocument()
  })

  it('still shows the moment briefing when geometric analysis is unavailable', () => {
    setPersonaMode('fan')
    renderWithProviders(
      <DecisionExplorerPanel
        matchId={base.matchId}
        eventId="evt-ng-possession-52"
        decisionUnavailable={{
          kind: 'insufficient-evidence',
          message: 'Event type is not analyzable.',
          retryable: true,
        }}
        intelligenceState={{
          status: 'ready',
          matchId: base.matchId,
          eventId: 'evt-ng-possession-52',
          intelligence: {
            matchId: base.matchId,
            eventId: 'evt-ng-possession-52',
            eventType: 'possession_change',
            provenance: 'synthetic',
            analysisMethod: 'deterministic_event_intelligence_v1',
            llmConnected: false,
            decisionCandidate: false,
            english: {
              headline: 'Possession change',
              keyObservations: ['Possession changed.'],
              limitations: [],
              whatHappened: ['Possession changed sides.'],
              whyItMattered: ['It reset attacking structure.'],
              whatCouldHaveHappened: [],
            },
            arabic: {
              headline: 'تغيير الاستحواذ',
              keyObservations: ['تغير الاستحواذ.'],
              limitations: [],
              whatHappened: ['تغير طرف الاستحواذ.'],
              whyItMattered: ['أعاد هيكل الهجوم.'],
              whatCouldHaveHappened: [],
            },
            statements: [],
            missingEvidence: [],
            limitations: [],
            decisionAnalysis: null,
          },
        }}
      />,
    )

    expect(screen.getByText('Possession changed sides.')).toBeInTheDocument()
    expect(
      screen.getByText(STRINGS.en.decisionAnalysisUnavailable, { exact: false }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: STRINGS.en.pickPassHeading }),
    ).not.toBeInTheDocument()
  })

  it('offers an explicit Ask the Agents action before calling the workflow', async () => {
    setPersonaMode('analyst')
    const askAgents = vi.fn()
    renderWithProviders(
      <DecisionExplorerPanel
        analysis={analysis}
        narrativeState={{ status: 'idle' }}
        onAskAgents={askAgents}
      />,
    )

    expect(screen.getByText(STRINGS.en.askAgentsDescription)).toBeInTheDocument()
    await userEvent.setup().click(
      screen.getByRole('button', { name: STRINGS.en.askAgentsAction }),
    )
    expect(askAgents).toHaveBeenCalledTimes(1)
  })

  it('labels a partial agent result only when the backend response is partial', () => {
    setPersonaMode('analyst')
    const partialResponse: DecisionNarrativeResponse = {
      ...narrativeResponse,
      analysis: {
        ...analysis,
        completeness: { ...analysis.completeness, level: 'partial' },
      },
      verificationResults: [
        {
          ...narrativeResponse.verificationResults[0]!,
          evidenceValidationStatus: 'partially_supported',
        },
      ],
    }
    renderWithProviders(
      <DecisionExplorerPanel
        analysis={analysis}
        narrativeState={{
          status: 'ready',
          matchId: base.matchId,
          eventId: base.eventId,
          response: partialResponse,
        }}
      />,
    )

    expect(screen.getByText(STRINGS.en.askAgentsPartial)).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.getByText(/claim-observed-score: Partially supported/)).toBeInTheDocument()
  })

  it('shows narrative unavailability explicitly and lets API errors retry', async () => {
    setPersonaMode('analyst')
    const retry = vi.fn()
    const { rerender } = renderWithProviders(
      <DecisionExplorerPanel
        analysis={analysis}
        narrativeState={{
          status: 'unavailable',
          matchId: base.matchId,
          eventId: base.eventId,
          message: 'Mock mode has no backend narrative.',
        }}
      />,
    )
    expect(screen.getAllByText(/backend narrative is unavailable/i).length).toBeGreaterThan(1)
    expect(screen.getAllByText(/Mock mode has no backend narrative/).length).toBeGreaterThan(1)

    rerender(
      <DecisionExplorerPanel
        analysis={analysis}
        narrativeState={{
          status: 'error',
          matchId: base.matchId,
          eventId: base.eventId,
          message: 'Network request failed.',
        }}
        onNarrativeRetry={retry}
      />,
    )
    expect(
      screen
        .getAllByRole('alert')
        .some((alert) => alert.textContent?.includes('Network request failed.')),
    ).toBe(true)
    await userEvent.setup().click(
      screen.getAllByRole('button', { name: STRINGS.en.decisionNarrativeRetry })[0]!,
    )
    expect(retry).toHaveBeenCalledOnce()
  })
})

describe('DecisionExplorerPage dual-source loading', () => {
  function renderPage(matchId: string, eventId: string) {
    return renderWithProviders(
      <Routes>
        <Route
          path="/matches/:matchId/decisions/:eventId"
          element={<DecisionExplorerPage />}
        />
      </Routes>,
      { initialEntries: [`/matches/${matchId}/decisions/${eventId}`] },
    )
  }

  it('shows a non-decision briefing when geometric analysis is unavailable', async () => {
    setPersonaMode('fan')
    const intelligence: EventIntelligence = {
      matchId: 'm-northgate-riverside-2401',
      eventId: 'evt-ng-possession-52',
      eventType: 'possession_change',
      provenance: 'synthetic',
      analysisMethod: 'deterministic_event_intelligence_v1',
      llmConnected: false,
      decisionCandidate: false,
      english: {
        headline: 'Possession change',
        keyObservations: ['Possession changed.'],
        limitations: [],
        whatHappened: ['Possession changed sides.'],
        whyItMattered: ['It reset attacking structure.'],
        whatCouldHaveHappened: [],
      },
      arabic: {
        headline: 'تغيير الاستحواذ',
        keyObservations: ['تغير الاستحواذ.'],
        limitations: [],
        whatHappened: ['تغير طرف الاستحواذ.'],
        whyItMattered: ['أعاد هيكل الهجوم.'],
        whatCouldHaveHappened: [],
      },
      statements: [
        {
          tier: 'fact',
          english: 'Possession changed according to the match log.',
          arabic: 'تغير الاستحواذ وفق سجل المباراة.',
        },
      ],
      missingEvidence: [],
      limitations: [],
      decisionAnalysis: null,
    }

    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockRejectedValue(
      new matchServices.DecisionInsufficientEvidenceError(
        'Event type is not analyzable.',
        'm-northgate-riverside-2401',
        'evt-ng-possession-52',
      ),
    )
    vi.spyOn(matchServices.matchService, 'getEventIntelligence').mockResolvedValue(
      intelligence,
    )
    vi.spyOn(matchServices.matchService, 'getMatchById').mockResolvedValue({
      id: 'm-northgate-riverside-2401',
      homeTeam: {
        id: 't-home',
        name: 'Northgate FC',
        shortName: 'NG',
      },
      awayTeam: {
        id: 't-away',
        name: 'Riverside',
        shortName: 'RV',
      },
      kickoffAt: '2024-01-01T00:00:00.000Z',
      competition: 'Demo',
      venue: 'Demo',
      status: 'finished',
      score: { home: 1, away: 0 },
      provenance: 'synthetic',
      scenarioId: 'demo',
    } as MatchSummary)
    vi.spyOn(matchServices.matchService, 'getMatchEvents').mockResolvedValue([])
    vi.spyOn(matchServices.matchService, 'getMatchPlayers').mockResolvedValue([])
    vi.spyOn(matchServices.matchService, 'getMatchFrames').mockResolvedValue([])

    renderPage('m-northgate-riverside-2401', 'evt-ng-possession-52')

    await waitFor(() => {
      expect(screen.getByText('Possession changed sides.')).toBeInTheDocument()
    })
    expect(screen.getByText(STRINGS.en.decisionLlmDisconnected)).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.decisionTierFact)).toBeInTheDocument()
    expect(
      screen.getByText(STRINGS.en.decisionAnalysisUnavailable, { exact: false }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('decision-view-fan')).toBeInTheDocument()
  })

  it('does not fabricate a briefing when event intelligence is unavailable', async () => {
    setPersonaMode('fan')
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue(
      analysis,
    )
    vi.spyOn(matchServices.matchService, 'getEventIntelligence').mockRejectedValue(
      new matchServices.EventIntelligenceUnavailableError(
        'Event intelligence is unavailable in mock mode.',
        analysis.matchId,
        analysis.eventId,
      ),
    )
    vi.spyOn(matchServices.matchService, 'getMatchById').mockResolvedValue({
      id: analysis.matchId,
      homeTeam: {
        id: 't-home',
        name: 'Northgate FC',
        shortName: 'NG',
      },
      awayTeam: {
        id: 't-away',
        name: 'Riverside',
        shortName: 'RV',
      },
      kickoffAt: '2024-01-01T00:00:00.000Z',
      competition: 'Demo',
      venue: 'Demo',
      status: 'finished',
      score: { home: 1, away: 0 },
      provenance: 'synthetic',
      scenarioId: 'demo',
    } as MatchSummary)
    vi.spyOn(matchServices.matchService, 'getMatchEvents').mockResolvedValue([])
    vi.spyOn(matchServices.matchService, 'getMatchPlayers').mockResolvedValue([])
    vi.spyOn(matchServices.matchService, 'getMatchFrames').mockResolvedValue([])

    renderPage(analysis.matchId, analysis.eventId)

    await waitFor(() => {
      expect(screen.getByTestId('decision-briefing-empty')).toBeInTheDocument()
    })
    expect(screen.getByTestId('decision-briefing-empty')).toHaveTextContent(
      STRINGS.en.decisionIntelEmptyHint,
    )
    expect(
      screen.getByRole('heading', { name: STRINGS.en.pickPassHeading }),
    ).toBeInTheDocument()
  })
})
