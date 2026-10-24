import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as matchServices from '../services/matches'
import type { DecisionNarrativeResponse } from '../types'
import { MatchApiError } from '../services/matches'
import { useDecisionNarrative } from './useDecisionNarrative'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const response: DecisionNarrativeResponse = {
  matchId: 'm-1',
  eventId: 'evt-1',
  provenance: 'synthetic',
  analysis: {} as DecisionNarrativeResponse['analysis'],
  verificationResults: [],
  narrative: {
    matchId: 'm-1',
    eventId: 'evt-1',
    provenance: 'synthetic',
    english: { headline: 'English', keyObservations: [], limitations: [] },
    arabic: { headline: 'عربي', keyObservations: [], limitations: [] },
  },
}

function Probe({ enabled = true }: { enabled?: boolean }) {
  const { state, retry } = useDecisionNarrative('m-1', 'evt-1', enabled)
  return (
    <div>
      <p data-testid="status">{state.status}</p>
      <p data-testid="headline">
        {state.status === 'ready' ? state.response.narrative.english.headline : ''}
      </p>
      <button type="button" onClick={retry}>retry</button>
    </div>
  )
}

describe('useDecisionNarrative', () => {
  it('does not call the backend workflow until it is explicitly enabled', async () => {
    const getDecisionNarrative = vi
      .spyOn(matchServices.matchService, 'getDecisionNarrative')
      .mockResolvedValue(response)
    const { rerender } = render(<Probe enabled={false} />)

    expect(screen.getByTestId('status')).toHaveTextContent('idle')
    expect(getDecisionNarrative).not.toHaveBeenCalled()

    rerender(<Probe enabled />)
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
    })
    expect(getDecisionNarrative).toHaveBeenCalledWith('m-1', 'evt-1')
  })

  it('surfaces an HTTP error and retries the same backend request', async () => {
    const getDecisionNarrative = vi
      .spyOn(matchServices.matchService, 'getDecisionNarrative')
      .mockRejectedValueOnce(new MatchApiError('Narrative API unavailable', 503))
      .mockResolvedValueOnce(response)

    const user = userEvent.setup()
    render(<Probe />)

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('error')
    })
    await user.click(screen.getByRole('button', { name: 'retry' }))
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
      expect(screen.getByTestId('headline')).toHaveTextContent('English')
    })
    expect(getDecisionNarrative).toHaveBeenCalledTimes(2)
    expect(getDecisionNarrative).toHaveBeenLastCalledWith('m-1', 'evt-1')
  })
})
