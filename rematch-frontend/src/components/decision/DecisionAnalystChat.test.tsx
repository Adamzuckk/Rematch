import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DecisionAnalystChat } from './DecisionAnalystChat'
import * as matchServices from '../../services/matches'
import { SYNTHETIC_DECISION_ANALYSES } from '../../mocks/decisionAnalysis'
import type { DecisionAnalysis, DecisionNarrativeResponse } from '../../types'
import { STRINGS } from '../../i18n/strings'
import { renderWithProviders } from '../../test/render'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  window.localStorage.setItem('rematch.locale', 'en')
})

const fixture = SYNTHETIC_DECISION_ANALYSES['m-northgate-riverside-2401::evt-ng-carry-64']!
const analysis: DecisionAnalysis = {
  ...fixture,
  provenance: 'api',
  observed: {
    ...fixture.observed,
    compositeScore: 14.125,
    metrics: [{ name: 'progressive_distance', status: 'available', value: 4.125, unit: 'pitch_percent', formula: 'returned by backend', inputs: {} }],
  },
  completeness: {
    ...fixture.completeness,
    hasAlignedFrame: true,
    teammatePositionsInFrame: 10,
    opponentPositionsInFrame: 9,
    alternativeCount: 2,
  },
  alternatives: [
    { actionId: 'alt-one', kind: 'hypothetical_pass', label: 'Alternative One', start: null, end: null, targetPlayerId: 'player-one', metrics: [], compositeScore: 18.75, rankable: true, limitations: [] },
    { actionId: 'alt-two', kind: 'hypothetical_pass', label: 'Alternative Two', start: null, end: null, targetPlayerId: 'player-two', metrics: [], compositeScore: 16.4, rankable: true, limitations: [] },
  ],
  ranking: [
    { rank: 1, actionId: 'alt-one', kind: 'hypothetical_pass', label: 'Alternative One', compositeScore: 18.75, targetPlayerId: 'player-one', rankable: true },
    { rank: 2, actionId: 'alt-two', kind: 'hypothetical_pass', label: 'Alternative Two', compositeScore: 16.4, targetPlayerId: 'player-two', rankable: true },
    { rank: 3, actionId: analysisObservedId(fixture), kind: fixture.observed.kind, label: fixture.observed.label, compositeScore: 14.125, targetPlayerId: null, rankable: true },
  ],
  context: { ...fixture.context, playerName: 'API Player', minute: 64 },
}

function analysisObservedId(value: DecisionAnalysis): string {
  return value.observed.actionId
}

const narrativeResponse: DecisionNarrativeResponse = {
  matchId: analysis.matchId,
  eventId: analysis.eventId,
  provenance: 'api',
  analysis,
  verificationResults: [
    {
      claimId: 'claim-1', submittedStatement: 'Evidence statement', evidenceValidationStatus: 'verified',
      claimSupportStatus: 'not_assessed', reason: 'Reference matched', evidence: [], limitations: [],
      validationMethod: 'match_event_evidence_catalog_v1',
      validationScope: 'evidence_reference_membership_and_registered_calculation_consistency',
    },
    {
      claimId: 'claim-2', submittedStatement: 'Another statement', evidenceValidationStatus: 'unsupported',
      claimSupportStatus: 'not_assessed', reason: 'No registered reference', evidence: [], limitations: [],
      validationMethod: 'match_event_evidence_catalog_v1',
      validationScope: 'evidence_reference_membership_and_registered_calculation_consistency',
    },
  ],
  narrative: {
    matchId: analysis.matchId,
    eventId: analysis.eventId,
    provenance: 'api',
    english: {
      headline: 'Backend decision summary',
      keyObservations: ['Observed action comes from the analysis response.'],
      limitations: ['Reference validation does not certify claim truth.'],
    },
    arabic: {
      headline: 'ملخص القرار من الخادم',
      keyObservations: ['الإجراء المرصود من استجابة التحليل.'],
      limitations: ['التحقق من المراجع لا يثبت صحة الادعاء.'],
    },
  },
}

describe('DecisionAnalystChat', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MATCH_DATA_SOURCE', 'api')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')))
  })

  async function openChat(user = userEvent.setup()) {
    renderWithProviders(
      <DecisionAnalystChat matchId={analysis.matchId} eventId={analysis.eventId} />,
    )
    expect(screen.getByTestId('decision-analyst-chat')).toBeInTheDocument()
    return user
  }

  async function askTyped(user: ReturnType<typeof userEvent.setup>, text: string) {
    await user.type(screen.getByRole('textbox'), text)
    const send = screen.getAllByRole('button').find((button) =>
      [STRINGS.en.analystSend, STRINGS.ar.analystSend].includes(button.textContent?.trim() ?? ''),
    )
    if (!send) throw new Error('Send button was not found')
    await user.click(send)
  }

  it('sends free-form chat to the orchestrator with the current decision identifiers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response: {
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: 'ReMatch Orchestrator confirmed.' }],
        }],
      },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const getAnalysis = vi.spyOn(matchServices.matchService, 'getDecisionAnalysis')
    const user = await openChat()

    await askTyped(user, 'Confirm you are the orchestrator')

    expect(await screen.findByText('ReMatch Orchestrator confirmed.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://rematch-dxd6gbbsfufwh3ce.westus3-01.azurewebsites.net/api/orchestrate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          message: 'Confirm you are the orchestrator',
          matchId: analysis.matchId,
          eventId: analysis.eventId,
        }),
      }),
    )
    expect(getAnalysis).not.toHaveBeenCalled()
  })

  it('shows a friendly translated error for non-retryable orchestrator responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'do-not-render-this-token' }),
      { status: 401 },
    )))
    const getAnalysis = vi.spyOn(matchServices.matchService, 'getDecisionAnalysis')
    const user = await openChat()

    await askTyped(user, 'What ranked higher?')

    expect(await screen.findByText(STRINGS.en.analystOrchestratorError)).toBeInTheDocument()
    expect(screen.queryByText(/do-not-render-this-token/)).not.toBeInTheDocument()
    expect(getAnalysis).not.toHaveBeenCalled()
  })

  it('answers score and metric questions from the API response and caches analysis for follow-ups', async () => {
    const getAnalysis = vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue(analysis)
    const user = await openChat()
    await askTyped(user, 'show the observed score and metrics')
    expect(await screen.findByText(/14\.125/)).toBeInTheDocument()
    expect(screen.getByText(/4\.125 pitch_percent/)).toBeInTheDocument()
    expect(screen.getByText(/Geometric scores are not probabilities/)).toBeInTheDocument()
    await askTyped(user, 'what was the score?')
    await waitFor(() => expect(getAnalysis).toHaveBeenCalledTimes(1))
  })

  it('answers what ranked higher using backend ranks and scores', async () => {
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue(analysis)
    const user = await openChat()
    await askTyped(user, 'what ranked higher than the observed pass?')
    expect(await screen.findByText(/#1 Alternative One/)).toBeInTheDocument()
    expect(screen.getByText(/18\.75/)).toBeInTheDocument()
  })

  it('lists the requested alternatives from the analysis payload', async () => {
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue(analysis)
    const user = await openChat()
    await askTyped(user, 'how many alternatives? show top 2')
    expect(await screen.findByText(/Available alternatives \(2\)/)).toBeInTheDocument()
    expect(screen.getByText(/#1 Alternative One/)).toBeInTheDocument()
    expect(screen.getByText(/#2 Alternative Two/)).toBeInTheDocument()
  })

  it('answers player and frame questions from completeness fields', async () => {
    const getAnalysis = vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue(analysis)
    const user = await openChat()
    await askTyped(user, 'how many players here?')
    // Prefer field labels — timestamps like "10:12 PM" also match bare /10/.
    expect(await screen.findByText(/Teammates in frame: 10/)).toBeInTheDocument()
    expect(screen.getByText(/Opponents in frame: 9/)).toBeInTheDocument()
    expect(screen.getByText(/Alternative count: 2/)).toBeInTheDocument()
    expect(screen.getByText(/Aligned frame available: Yes/)).toBeInTheDocument()
    await askTyped(user, 'how many teammates in the frame?')
    expect(await screen.findAllByText(/Alternative count: 2/)).toHaveLength(2)
    expect(getAnalysis).toHaveBeenCalledTimes(1)
  })

  it('uses verificationResults counts and explains not_assessed', async () => {
    const getAnalysis = vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue(analysis)
    const getNarrative = vi.spyOn(matchServices.matchService, 'getDecisionNarrative').mockResolvedValue(narrativeResponse)
    const user = await openChat()
    await user.click(screen.getByRole('button', { name: STRINGS.en.analystChipVerification }))
    expect(await screen.findByText(/claimSupportStatus is not_assessed/)).toBeInTheDocument()
    expect(screen.getByText(/Verification results: 2/)).toBeInTheDocument()
    await askTyped(user, 'are the evidence claims true?')
    await waitFor(() => expect(getAnalysis).toHaveBeenCalledTimes(1))
    expect(getNarrative).toHaveBeenCalledTimes(1)
  })

  it('uses the locale-specific backend narrative and reuses it for follow-up verification', async () => {
    window.localStorage.setItem('rematch.locale', 'ar')
    const getAnalysis = vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue(analysis)
    const getNarrative = vi.spyOn(matchServices.matchService, 'getDecisionNarrative').mockResolvedValue(narrativeResponse)
    renderWithProviders(
      <DecisionAnalystChat matchId={analysis.matchId} eventId={analysis.eventId} />,
    )
    const user = userEvent.setup()
    expect(screen.getByTestId('decision-analyst-chat')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: STRINGS.ar.analystChipSummary }))
    expect(await screen.findByText(/ملخص القرار من الخادم/)).toBeInTheDocument()
    await askTyped(user, 'نتائج التحقق لهذه اللحظة')
    expect(await screen.findByText(/claimSupportStatus هو not_assessed/)).toBeInTheDocument()
    expect(getAnalysis).toHaveBeenCalledTimes(1)
    expect(getNarrative).toHaveBeenCalledTimes(1)
  })

  it('shows help and chips for unknown questions without false citations or API calls', async () => {
    const getAnalysis = vi.spyOn(matchServices.matchService, 'getDecisionAnalysis')
    const user = await openChat()
    await askTyped(user, 'tell me a joke about football')
    expect(await screen.findByText(STRINGS.en.analystHelp)).toBeInTheDocument()
    expect(getAnalysis).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: STRINGS.en.analystChipFrame })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: STRINGS.en.analystCitation })).not.toBeInTheDocument()
  })

  it('shows a grounded welcome state and can start a fresh conversation', async () => {
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue(analysis)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = await openChat()
    expect(screen.getByRole('heading', { name: STRINGS.en.analystWelcome })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: STRINGS.en.analystChipRanking }))
    expect(await screen.findByText(/#1 Alternative One/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: STRINGS.en.askCrewClear }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: STRINGS.en.analystWelcome })).toBeInTheDocument()
    expect(screen.queryByText(/#1 Alternative One/)).not.toBeInTheDocument()
  })

  it('keeps limitations short and does not merge duplicate narrative limitations', async () => {
    const getAnalysis = vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue({
      ...analysis,
      limitations: ['Synthetic demo data.', 'Synthetic demo data.', 'No aligned frame.', 'Geometric scores are not probability.'],
    })
    const getNarrative = vi.spyOn(matchServices.matchService, 'getDecisionNarrative')
    const user = await openChat()
    await askTyped(user, 'what are the limitations?')
    expect(await screen.findByText(/Limitations returned for this decision/)).toBeInTheDocument()
    expect(screen.getAllByText(/Synthetic demo data/)).toHaveLength(1)
    expect(getAnalysis).toHaveBeenCalledTimes(1)
    expect(getNarrative).not.toHaveBeenCalled()
  })

  it('answers the event context only with fields returned by analysis', async () => {
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockResolvedValue(analysis)
    const user = await openChat()
    await askTyped(user, 'who was the player and what minute was this event?')
    expect(await screen.findByText(/API Player/)).toBeInTheDocument()
    expect(screen.getByText(/64/)).toBeInTheDocument()
  })

  it('shows a friendly error without rendering service error details', async () => {
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockRejectedValue(new Error('Authorization: Bearer do-not-render-this'))
    const user = await openChat()
    await askTyped(user, 'what ranked higher?')
    expect(await screen.findByText(STRINGS.en.analystOrchestratorError)).toBeInTheDocument()
    expect(screen.queryByText(/do-not-render-this/)).not.toBeInTheDocument()
  })
})
