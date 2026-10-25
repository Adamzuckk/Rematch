import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as matchServices from '../services/matches'
import { AskUnavailableError, MatchApiError } from '../services/matches'
import type { AskResponse } from '../types'
import { useAskCrew } from './useAskCrew'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const greeting: AskResponse = {
  matchId: 'm-1',
  eventId: 'evt-1',
  status: 'answered',
  intent: 'greeting',
  provenance: 'synthetic',
  answer: {
    english: {
      headline: 'Ask the crew',
      keyObservations: ['Capabilities'],
      limitations: ['Not unrestricted chat'],
    },
    arabic: {
      headline: 'اسأل الطاقم',
      keyObservations: ['قدرات'],
      limitations: ['ليست محادثة مطلقة'],
    },
  },
  evidence: [],
  relatedEventIds: ['evt-1'],
  factClasses: ['capability'],
  reason: 'Capability explanation',
  verificationResults: [],
  clientRequestId: 'c1',
}

function Probe() {
  const { state, ask, retry, clear, loading } = useAskCrew('m-1')
  return (
    <div>
      <p data-testid="status">{state.status}</p>
      <p data-testid="loading">{loading ? 'yes' : 'no'}</p>
      <p data-testid="turns">{state.turns.length}</p>
      <p data-testid="headline">
        {state.turns[0]?.response?.answer.english.headline ?? ''}
      </p>
      <p data-testid="error">
        {state.status === 'error' ? state.message : ''}
      </p>
      <button
        type="button"
        onClick={() => void ask({ question: 'hi', eventId: 'evt-1' })}
      >
        ask
      </button>
      <button type="button" onClick={() => void retry('evt-1', 'en')}>
        retry
      </button>
      <button type="button" onClick={clear}>
        clear
      </button>
    </div>
  )
}

describe('useAskCrew', () => {
  it('loads a visible answer for a valid question', async () => {
    const askMatch = vi
      .spyOn(matchServices.matchService, 'askMatch')
      .mockResolvedValue(greeting)
    const user = userEvent.setup()
    render(<Probe />)

    await user.click(screen.getByRole('button', { name: 'ask' }))
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
    })
    expect(screen.getByTestId('headline')).toHaveTextContent('Ask the crew')
    expect(askMatch).toHaveBeenCalledWith(
      'm-1',
      expect.objectContaining({
        question: 'hi',
        eventId: 'evt-1',
      }),
    )
  })

  it('prevents duplicate in-flight submissions', async () => {
    let resolveAsk: (value: AskResponse) => void = () => undefined
    const askMatch = vi.spyOn(matchServices.matchService, 'askMatch').mockImplementation(
      () =>
        new Promise<AskResponse>((resolve) => {
          resolveAsk = resolve
        }),
    )
    const user = userEvent.setup()
    render(<Probe />)

    await user.click(screen.getByRole('button', { name: 'ask' }))
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('yes')
    })
    await user.click(screen.getByRole('button', { name: 'ask' }))
    expect(askMatch).toHaveBeenCalledTimes(1)
    resolveAsk(greeting)
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
    })
  })

  it('surfaces backend errors and retries the last question', async () => {
    const askMatch = vi
      .spyOn(matchServices.matchService, 'askMatch')
      .mockRejectedValueOnce(new MatchApiError('Ask timed out', undefined, 'ask_timeout'))
      .mockResolvedValueOnce(greeting)
    const user = userEvent.setup()
    render(<Probe />)

    await user.click(screen.getByRole('button', { name: 'ask' }))
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('error')
      expect(screen.getByTestId('error')).toHaveTextContent(/timed out/i)
    })
    await user.click(screen.getByRole('button', { name: 'retry' }))
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
    })
    expect(askMatch).toHaveBeenCalledTimes(2)
  })

  it('clears conversation state', async () => {
    vi.spyOn(matchServices.matchService, 'askMatch').mockResolvedValue(greeting)
    const user = userEvent.setup()
    render(<Probe />)
    await user.click(screen.getByRole('button', { name: 'ask' }))
    await waitFor(() => {
      expect(screen.getByTestId('turns')).toHaveTextContent('1')
    })
    await user.click(screen.getByRole('button', { name: 'clear' }))
    expect(screen.getByTestId('status')).toHaveTextContent('idle')
    expect(screen.getByTestId('turns')).toHaveTextContent('0')
  })

  it('records mock-unavailable answers without inventing content', async () => {
    vi.spyOn(matchServices.matchService, 'askMatch').mockRejectedValue(
      new AskUnavailableError('Ask unavailable in mock mode', 'm-1'),
    )
    const user = userEvent.setup()
    render(<Probe />)
    await user.click(screen.getByRole('button', { name: 'ask' }))
    await waitFor(() => {
      expect(screen.getByTestId('turns')).toHaveTextContent('1')
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
    })
  })
})
