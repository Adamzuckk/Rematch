import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DecisionAnalystChat } from './DecisionAnalystChat'
import * as matchServices from '../../services/matches'
import { SYNTHETIC_DECISION_ANALYSES } from '../../mocks/decisionAnalysis'
import type { DecisionNarrativeResponse } from '../../types'
import { STRINGS } from '../../i18n/strings'
import { renderWithProviders } from '../../test/render'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  window.localStorage.setItem('rematch.locale', 'en')
})

const analysis = SYNTHETIC_DECISION_ANALYSES[
  'm-northgate-riverside-2401::evt-ng-carry-64'
]!

const narrativeResponse: DecisionNarrativeResponse = {
  matchId: analysis.matchId,
  eventId: analysis.eventId,
  provenance: analysis.provenance,
  analysis,
  verificationResults: [
    {
      claimId: 'claim-1',
      submittedStatement: 'Evidence statement',
      evidenceValidationStatus: 'verified',
      claimSupportStatus: 'not_assessed',
      reason: 'Reference matched',
      evidence: [],
      limitations: [],
      validationMethod: 'match_event_evidence_catalog_v1',
      validationScope: 'evidence_reference_membership_and_registered_calculation_consistency',
    },
  ],
  narrative: {
    matchId: analysis.matchId,
    eventId: analysis.eventId,
    provenance: analysis.provenance,
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
  })

  it('answers ranking questions with API analysis values only', async () => {
    const getAnalysis = vi
      .spyOn(matchServices.matchService, 'getDecisionAnalysis')
      .mockResolvedValue(analysis)
    const getNarrative = vi.spyOn(matchServices.matchService, 'getDecisionNarrative')
    const user = userEvent.setup()
    renderWithProviders(
      <DecisionAnalystChat matchId={analysis.matchId} eventId={analysis.eventId} />,
    )

    await user.click(screen.getByRole('button', { name: STRINGS.en.analystOpen }))
    await user.click(screen.getByRole('button', { name: STRINGS.en.analystChipRanking }))

    const expectedScore = String(analysis.observed.compositeScore)
    await waitFor(() => {
      expect(screen.getByText(new RegExp(expectedScore.replace('.', '\\.')))).toBeInTheDocument()
    })
    expect(getAnalysis).toHaveBeenCalledWith(analysis.matchId, analysis.eventId)
    expect(getNarrative).not.toHaveBeenCalled()
  })

  it('loads the composed narrative for summary and verification questions', async () => {
    const getAnalysis = vi
      .spyOn(matchServices.matchService, 'getDecisionAnalysis')
      .mockResolvedValue(analysis)
    const getNarrative = vi
      .spyOn(matchServices.matchService, 'getDecisionNarrative')
      .mockResolvedValue(narrativeResponse)
    const user = userEvent.setup()
    renderWithProviders(
      <DecisionAnalystChat matchId={analysis.matchId} eventId={analysis.eventId} />,
    )

    await user.click(screen.getByRole('button', { name: STRINGS.en.analystOpen }))
    await user.click(screen.getByRole('button', { name: STRINGS.en.analystChipSummary }))
    expect(await screen.findByText(/Backend decision summary/)).toBeInTheDocument()
    expect(getNarrative).toHaveBeenCalledWith(analysis.matchId, analysis.eventId)

    const input = screen.getByRole('textbox', { name: STRINGS.en.analystPlaceholder })
    await user.type(input, 'verification results for this moment')
    await user.click(screen.getByRole('button', { name: STRINGS.en.analystSend }))
    expect(await screen.findByText(/claimSupportStatus is not_assessed/)).toBeInTheDocument()
    expect(getAnalysis).toHaveBeenCalledTimes(2)
    expect(getNarrative).toHaveBeenCalledTimes(2)
  })

  it('shows a friendly error without rendering service error details', async () => {
    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockRejectedValue(
      new Error('Authorization: Bearer do-not-render-this'),
    )
    const user = userEvent.setup()
    renderWithProviders(
      <DecisionAnalystChat matchId={analysis.matchId} eventId={analysis.eventId} />,
    )

    await user.click(screen.getByRole('button', { name: STRINGS.en.analystOpen }))
    await user.click(screen.getByRole('button', { name: STRINGS.en.analystChipRanking }))
    expect(await screen.findByText(STRINGS.en.analystError)).toBeInTheDocument()
    expect(screen.queryByText(/do-not-render-this/)).not.toBeInTheDocument()
  })
})
