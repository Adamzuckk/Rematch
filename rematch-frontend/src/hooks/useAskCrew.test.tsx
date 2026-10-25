import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as orchestratorClient from '../services/orchestrator/orchestratorClient'
import { useAskCrew } from './useAskCrew'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Probe() {
  const { state, ask, retry, clear, loading } = useAskCrew('m-1')
  return (
    <div>
      <p data-testid="status">{state.status}</p>
      <p data-testid="loading">{loading ? 'yes' : 'no'}</p>
      <p data-testid="turns">{state.turns.length}</p>
      <p data-testid="reply">{state.turns[0]?.reply ?? ''}</p>
      <p data-testid="error">{state.status === 'error' ? state.message : ''}</p>
      <button type="button" onClick={() => void ask({ question: 'hi', eventId: 'evt-1' })}>ask</button>
      <button type="button" onClick={() => void retry('evt-1', 'en')}>retry</button>
      <button type="button" onClick={clear}>clear</button>
    </div>
  )
}

describe('useAskCrew', () => {
  it('sends the current match and event to the orchestrator and shows its reply', async () => {
    const request = vi.spyOn(orchestratorClient, 'askOrchestrator').mockResolvedValue('Grounded orchestrator reply')
    const user = userEvent.setup()
    render(<Probe />)

    await user.click(screen.getByRole('button', { name: 'ask' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'))
    expect(screen.getByTestId('reply')).toHaveTextContent('Grounded orchestrator reply')
    expect(request).toHaveBeenCalledWith({ message: 'hi', matchId: 'm-1', eventId: 'evt-1' })
  })

  it('prevents duplicate in-flight submissions', async () => {
    let resolveReply: (value: string) => void = () => undefined
    const request = vi.spyOn(orchestratorClient, 'askOrchestrator').mockImplementation(
      () => new Promise<string>((resolve) => { resolveReply = resolve }),
    )
    const user = userEvent.setup()
    render(<Probe />)
    await user.click(screen.getByRole('button', { name: 'ask' }))
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('yes'))
    await user.click(screen.getByRole('button', { name: 'ask' }))
    expect(request).toHaveBeenCalledTimes(1)
    resolveReply('reply')
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'))
  })

  it('surfaces errors and retries through the orchestrator', async () => {
    const request = vi.spyOn(orchestratorClient, 'askOrchestrator')
      .mockRejectedValueOnce(new Error('Orchestrator request timed out'))
      .mockResolvedValueOnce('recovered reply')
    const user = userEvent.setup()
    render(<Probe />)
    await user.click(screen.getByRole('button', { name: 'ask' }))
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent(/timed out/i))
    await user.click(screen.getByRole('button', { name: 'retry' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'))
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('clears conversation state', async () => {
    vi.spyOn(orchestratorClient, 'askOrchestrator').mockResolvedValue('reply')
    const user = userEvent.setup()
    render(<Probe />)
    await user.click(screen.getByRole('button', { name: 'ask' }))
    await waitFor(() => expect(screen.getByTestId('turns')).toHaveTextContent('1'))
    await user.click(screen.getByRole('button', { name: 'clear' }))
    expect(screen.getByTestId('status')).toHaveTextContent('idle')
    expect(screen.getByTestId('turns')).toHaveTextContent('0')
  })
})
