import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as matchServices from '../services/matches'
import type { DecisionAnalysis } from '../types'
import { useDecisionAnalysis } from './useDecisionAnalysis'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Probe({
  matchId,
  eventId,
}: {
  matchId: string
  eventId: string
}) {
  const { state, retry } = useDecisionAnalysis(matchId, eventId)
  return (
    <div>
      <div data-testid="status">{state.status}</div>
      <div data-testid="event">
        {state.status === 'ready' ? state.analysis.eventId : ''}
      </div>
      <div data-testid="label">
        {state.status === 'ready' ? state.analysis.observed.label : ''}
      </div>
      <button type="button" onClick={retry}>
        retry
      </button>
    </div>
  )
}

function Switcher() {
  const [eventId, setEventId] = useState('evt-slow')
  return (
    <div>
      <button type="button" onClick={() => setEventId('evt-fast')}>
        switch
      </button>
      <Probe matchId="m-1" eventId={eventId} />
    </div>
  )
}

function analysisFor(
  eventId: string,
  label: string,
): DecisionAnalysis {
  return {
    matchId: 'm-1',
    eventId,
    eventType: 'pass',
    teamId: null,
    playerId: null,
    isHomeTeam: true,
    scoringMethodId: 'geometric_progression_v1',
    scoringMethodVersion: '1.0.0',
    scoringAssumptions: [],
    observed: {
      actionId: `observed:${eventId}`,
      kind: 'observed_pass',
      label,
      start: null,
      end: null,
      targetPlayerId: null,
      metrics: [],
      compositeScore: 10,
      rankable: true,
      limitations: [],
    },
    alternatives: [],
    ranking: [],
    claims: [],
    completeness: {
      level: 'partial',
      hasCoordinates: true,
      hasAlignedFrame: false,
      teammatePositionsInFrame: 0,
      opponentPositionsInFrame: 0,
      alternativeCount: 0,
      missing: [],
      notes: [],
    },
    confidence: 'low',
    limitations: [],
    context: {},
    provenance: 'synthetic',
  }
}

describe('useDecisionAnalysis', () => {
  it('ignores stale responses when the event changes mid-flight', async () => {
    const user = userEvent.setup()
    let resolveSlow!: (value: DecisionAnalysis) => void
    const slowPromise = new Promise<DecisionAnalysis>((resolve) => {
      resolveSlow = resolve
    })

    vi.spyOn(matchServices.matchService, 'getDecisionAnalysis').mockImplementation(
      (matchId, eventId) => {
        if (eventId === 'evt-slow') return slowPromise
        return Promise.resolve(analysisFor('evt-fast', 'Fast action'))
      },
    )

    render(<Switcher />)

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('loading')
    })

    await user.click(screen.getByRole('button', { name: 'switch' }))

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
      expect(screen.getByTestId('event')).toHaveTextContent('evt-fast')
      expect(screen.getByTestId('label')).toHaveTextContent('Fast action')
    })

    resolveSlow(analysisFor('evt-slow', 'Slow action'))

    await waitFor(() => {
      expect(screen.getByTestId('event')).toHaveTextContent('evt-fast')
      expect(screen.getByTestId('label')).toHaveTextContent('Fast action')
    })
    expect(screen.queryByText('Slow action')).not.toBeInTheDocument()
  })

  it('caches successful analysis and skips duplicate requests', async () => {
    const spy = vi
      .spyOn(matchServices.matchService, 'getDecisionAnalysis')
      .mockResolvedValue(analysisFor('evt-a', 'Cached'))

    const { rerender } = render(<Probe matchId="m-1" eventId="evt-a" />)

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
    })
    expect(spy).toHaveBeenCalledTimes(1)

    rerender(<Probe matchId="m-1" eventId="evt-a" />)
    expect(screen.getByTestId('status')).toHaveTextContent('ready')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
