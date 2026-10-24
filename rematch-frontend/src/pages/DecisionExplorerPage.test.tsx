import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DecisionExplorerPanel } from '../components/decision/DecisionExplorerPanel'
import { STRINGS } from '../i18n/strings'
import { SYNTHETIC_DECISION_ANALYSES } from '../mocks/decisionAnalysis'
import type {
  ActionScore,
  DecisionNarrativeResponse,
  MatchFrame,
  MatchSummary,
} from '../types'
import { renderWithProviders } from '../test/render'

afterEach(() => {
  cleanup()
  window.localStorage.setItem('rematch.locale', 'en')
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

    expect(screen.getByRole('heading', { name: STRINGS.ar.decisionTitle })).toBeInTheDocument()
    expect(screen.getByLabelText(STRINGS.ar.pickPassSelect)).toBeInTheDocument()
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('dir', 'rtl')
      expect(document.documentElement).toHaveAttribute('lang', 'ar')
    })
  })

  it('renders backend-returned English and Arabic narrative without treating reference checks as claim truth', async () => {
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
    expect(screen.getByText('not_assessed')).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.decisionPipelineVerifierNote)).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.decisionPipelineFooter)).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.decisionPipelineKeyPoints)).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.decisionPipelineLimitation)).toBeInTheDocument()

    const englishNarrative = within(screen.getByTestId('decision-narrative-content'))
    expect(englishNarrative.getByText(narrativeResponse.narrative.english.headline)).toBeInTheDocument()
    expect(englishNarrative.getByText('The backend returned a geometric score.')).toBeInTheDocument()
    expect(englishNarrative.getByText('Synthetic match data only.')).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.decisionNarrativeVerificationScope)).toBeInTheDocument()
    expect(screen.getByText(/Narrative provenance: Synthetic data/)).toBeInTheDocument()

    window.localStorage.setItem('rematch.locale', 'ar')
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
      expect(screen.getByText(STRINGS.ar.decisionNarrativeVerificationScope)).toBeInTheDocument()
    })
  })

  it('shows narrative unavailability explicitly and lets API errors retry', async () => {
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
