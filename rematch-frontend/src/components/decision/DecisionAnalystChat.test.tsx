import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STRINGS } from '../../i18n/strings'
import * as orchestratorClient from '../../services/orchestrator/orchestratorClient'
import { renderWithProviders } from '../../test/render'
import { DecisionAnalystChat } from './DecisionAnalystChat'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.localStorage.setItem('rematch.locale', 'en')
})

describe('DecisionAnalystChat', () => {
  it('sends free-form chat only to the orchestrator with current decision identifiers', async () => {
    const request = vi.spyOn(orchestratorClient, 'askOrchestrator').mockResolvedValue(
      'Orchestrator reply with backend-grounded information.',
    )
    const user = userEvent.setup()
    renderWithProviders(
      <DecisionAnalystChat matchId="match-8" eventId="event-4" />,
    )

    await user.type(screen.getByRole('textbox'), 'Explain this decision')
    await user.click(screen.getByRole('button', { name: STRINGS.en.analystSend }))

    expect(await screen.findByText('Orchestrator reply with backend-grounded information.')).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith({
      message: 'Explain this decision',
      matchId: 'match-8',
      eventId: 'event-4',
    })
  })

  it('routes suggested prompts through the same orchestrator client', async () => {
    const request = vi.spyOn(orchestratorClient, 'askOrchestrator').mockResolvedValue('Grounded response')
    const user = userEvent.setup()
    renderWithProviders(
      <DecisionAnalystChat matchId="match-1" eventId="evt-1" />,
    )
    const prompt = STRINGS.en.analystChipRanking
    await user.click(screen.getByRole('button', { name: prompt }))

    expect(await screen.findByText('Grounded response')).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith({
      message: prompt,
      matchId: 'match-1',
      eventId: 'evt-1',
    })
  })

  it('shows a friendly error without falling back to client-generated match answers', async () => {
    const request = vi.spyOn(orchestratorClient, 'askOrchestrator').mockRejectedValue(
      new Error('Orchestrator request failed (503)'),
    )
    const user = userEvent.setup()
    renderWithProviders(
      <DecisionAnalystChat matchId="match-1" eventId="evt-1" />,
    )
    await user.type(screen.getByRole('textbox'), 'What ranked higher?')
    await user.click(screen.getByRole('button', { name: STRINGS.en.analystSend }))

    expect(await screen.findByText(STRINGS.en.analystOrchestratorError)).toBeInTheDocument()
    expect(screen.queryByText(/#1 Alternative One/)).not.toBeInTheDocument()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('shows loading while the orchestrator request is pending', async () => {
    let resolveReply: (value: string) => void = () => undefined
    vi.spyOn(orchestratorClient, 'askOrchestrator').mockImplementation(
      () => new Promise((resolve) => { resolveReply = resolve }),
    )
    const user = userEvent.setup()
    renderWithProviders(
      <DecisionAnalystChat matchId="match-1" eventId="evt-1" />,
    )
    await user.type(screen.getByRole('textbox'), 'Summarize this decision')
    await user.click(screen.getByRole('button', { name: STRINGS.en.analystSend }))
    expect(screen.getByRole('status')).toHaveTextContent(STRINGS.en.analystOrchestratorLoading)
    resolveReply('Done')
    await waitFor(() => expect(screen.getByText('Done')).toBeInTheDocument())
  })
})
