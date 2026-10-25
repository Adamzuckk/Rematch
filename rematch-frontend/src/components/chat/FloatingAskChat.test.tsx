import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FloatingAskChat } from './FloatingAskChat'
import * as orchestratorClient from '../../services/orchestrator/orchestratorClient'
import { SYNTHETIC_DECISION_ANALYSES } from '../../mocks/decisionAnalysis'
import type { DecisionAnalysis } from '../../types'
import { STRINGS } from '../../i18n/strings'
import { renderWithProviders } from '../../test/render'
import { useAskCrew } from '../../hooks/useAskCrew'

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
}

function AgentHarness({
  matchId,
  eventId,
  eventLabel,
}: {
  matchId: string
  eventId?: string | null
  eventLabel?: string | null
}) {
  const { state, ask, retry, clear } = useAskCrew(matchId)
  return (
    <FloatingAskChat
      variant="agent"
      matchId={matchId}
      eventId={eventId}
      eventLabel={eventLabel}
      askCrewState={state}
      onAskQuestion={(question) => {
        void ask({ question, eventId: eventId ?? null, language: 'en' })
      }}
      onAskRetry={() => {
        void retry(eventId ?? null, 'en')
      }}
      onClearAsk={clear}
    />
  )
}

describe('FloatingAskChat', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MATCH_DATA_SOURCE', 'api')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  })

  it('opens and closes the analyst popup from the launcher and Escape', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <FloatingAskChat
        variant="analyst"
        matchId={analysis.matchId}
        eventId={analysis.eventId}
        eventLabel="64' · carry"
        analysis={analysis}
      />,
    )

    const launcher = screen.getByTestId('floating-ask-launcher')
    expect(launcher).toHaveTextContent(STRINGS.en.floatingAskAnalystLauncher)
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('floating-ask-panel')).not.toBeVisible()

    await user.click(launcher)
    expect(launcher).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('floating-ask-panel')).toBeVisible()
    expect(screen.getByTestId('decision-analyst-chat')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('floating-ask-panel')).not.toBeVisible()

    await user.click(launcher)
    await user.click(screen.getByTestId('floating-ask-close'))
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps analyst conversation while the popup is toggled closed and open', async () => {
    vi.spyOn(orchestratorClient, 'askOrchestrator').mockResolvedValue('Teammates in frame: 10')
    const user = userEvent.setup()
    renderWithProviders(
      <FloatingAskChat
        variant="analyst"
        matchId={analysis.matchId}
        eventId={analysis.eventId}
        analysis={analysis}
      />,
    )

    await user.click(screen.getByTestId('floating-ask-launcher'))
    const panel = screen.getByTestId('floating-ask-panel')
    const input = within(panel).getByRole('textbox')
    await user.type(input, 'how many teammates in the frame?')
    await user.click(within(panel).getByRole('button', { name: STRINGS.en.analystSend }))
    expect(await within(panel).findByText(/Teammates in frame/i)).toBeInTheDocument()

    await user.click(screen.getByTestId('floating-ask-close'))
    expect(screen.getByTestId('floating-ask-panel')).not.toBeVisible()

    await user.click(screen.getByTestId('floating-ask-launcher'))
    expect(within(screen.getByTestId('floating-ask-panel')).getByText(/Teammates in frame/i)).toBeInTheDocument()
  })

  it('sends on Enter and inserts a newline on Shift+Enter in analyst mode', async () => {
    vi.spyOn(orchestratorClient, 'askOrchestrator').mockResolvedValue('Decision reply')
    const user = userEvent.setup()
    renderWithProviders(
      <FloatingAskChat
        variant="analyst"
        matchId={analysis.matchId}
        eventId={analysis.eventId}
        analysis={analysis}
      />,
    )

    await user.click(screen.getByTestId('floating-ask-launcher'))
    const input = within(screen.getByTestId('floating-ask-panel')).getByRole('textbox')
    await user.type(input, 'line one{Shift>}{Enter}{/Shift}line two')
    expect(input).toHaveValue('line one\nline two')

    await user.type(input, '{Enter}')
    expect(await screen.findByText(/line one/)).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('sends Agent/Crew messages to the orchestrator with match and event context', async () => {
    const request = vi.spyOn(orchestratorClient, 'askOrchestrator').mockResolvedValue('Player involved — grounded in the match record.')
    const user = userEvent.setup()
    renderWithProviders(<AgentHarness matchId="m-1" eventId="evt-1" eventLabel="12\' · pass" />)

    const launcher = screen.getByTestId('floating-ask-launcher')
    expect(launcher).toHaveTextContent(STRINGS.en.floatingAskAgentLauncher)
    await user.click(launcher)
    const panel = screen.getByTestId('floating-ask-panel')
    await user.type(within(panel).getByTestId('agent-ask-input'), 'who was involved?')
    await user.click(within(panel).getByRole('button', { name: STRINGS.en.analystSend }))

    expect(await within(panel).findByText(/Player involved/)).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith({
      message: 'who was involved?',
      matchId: 'm-1',
      eventId: 'evt-1',
    })
  })

  it('preserves agent conversation across open/close and clears with confirmation', async () => {
    vi.spyOn(orchestratorClient, 'askOrchestrator').mockResolvedValue('Hello from the crew — grounded capabilities only.')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderWithProviders(<AgentHarness matchId="m-1" eventId="evt-1" eventLabel="12\' · pass" />)

    await user.click(screen.getByTestId('floating-ask-launcher'))
    const panel = screen.getByTestId('floating-ask-panel')
    await user.type(within(panel).getByTestId('agent-ask-input'), 'hi')
    await user.click(within(panel).getByRole('button', { name: STRINGS.en.analystSend }))
    expect(await within(panel).findByText(/Hello from the crew/)).toBeInTheDocument()

    await user.click(screen.getByTestId('floating-ask-launcher'))
    await user.click(screen.getByTestId('floating-ask-launcher'))
    expect(within(screen.getByTestId('floating-ask-panel')).getByText(/Hello from the crew/)).toBeInTheDocument()
    await user.click(screen.getByTestId('floating-ask-clear'))
    expect(confirm).toHaveBeenCalled()
    await waitFor(() => expect(within(screen.getByTestId('floating-ask-panel')).getByTestId('agent-ask-empty')).toBeInTheDocument())
  })

  it('shows an orchestrator error without fabricating an answer', async () => {
    vi.spyOn(orchestratorClient, 'askOrchestrator').mockRejectedValue(new Error('Orchestrator unavailable'))
    const user = userEvent.setup()
    renderWithProviders(<AgentHarness matchId="m-1" eventId="evt-1" />)
    await user.click(screen.getByTestId('floating-ask-launcher'))
    const panel = screen.getByTestId('floating-ask-panel')
    await user.type(within(panel).getByTestId('agent-ask-input'), 'summarize the match')
    await user.click(within(panel).getByRole('button', { name: STRINGS.en.analystSend }))

    expect(await within(panel).findByText(/Orchestrator unavailable/i)).toBeInTheDocument()
    expect(within(panel).queryByText(/invented/i)).not.toBeInTheDocument()
  })
  it('surfaces a context-changed notice when the analyst event id changes', async () => {
    vi.spyOn(orchestratorClient, 'askOrchestrator').mockResolvedValue('Orchestrator help')
    const user = userEvent.setup()
    const { rerender } = renderWithProviders(
      <FloatingAskChat
        variant="analyst"
        matchId={analysis.matchId}
        eventId={analysis.eventId}
        eventLabel="64' · carry"
        analysis={analysis}
      />,
    )

    await user.click(screen.getByTestId('floating-ask-launcher'))
    const panel = screen.getByTestId('floating-ask-panel')
    await user.type(within(panel).getByRole('textbox'), 'help')
    await user.click(within(panel).getByRole('button', { name: STRINGS.en.analystSend }))
    expect(await within(panel).findByText('Orchestrator help')).toBeInTheDocument()

    rerender(
      <FloatingAskChat
        variant="analyst"
        matchId={analysis.matchId}
        eventId="evt-other"
        eventLabel="70' · pass"
        analysis={{ ...analysis, eventId: 'evt-other' }}
      />,
    )

    expect(
      within(screen.getByTestId('floating-ask-panel')).getByText(
        new RegExp(`${STRINGS.en.floatingAskContextChanged}.*70'`),
      ),
    ).toBeInTheDocument()
  })

})
