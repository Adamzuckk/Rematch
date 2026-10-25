import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STRINGS } from '../../i18n/strings'
import { SYNTHETIC_EVENTS } from '../../mocks/events'
import { SYNTHETIC_PLAYERS } from '../../mocks/players'
import { SYNTHETIC_TEAMS } from '../../mocks/teams'
import { sortMatchEvents } from '../../lib/pitch'
import type { DecisionNarrativeResponse, MatchEvent } from '../../types'
import { renderWithProviders } from '../../test/render'
import { MatchStudioPanel } from './MatchStudioPanel'

afterEach(() => {
  cleanup()
  window.localStorage.setItem('rematch.locale', 'en')
})

const events = sortMatchEvents(
  SYNTHETIC_EVENTS.filter((e) => e.matchId === 'm-northgate-riverside-2401'),
)
const selected = events[0]!
const players = Object.values(SYNTHETIC_PLAYERS)

const narrativeResponse: DecisionNarrativeResponse = {
  matchId: 'm-northgate-riverside-2401',
  eventId: selected.id,
  provenance: 'synthetic',
  analysis: {
    matchId: 'm-northgate-riverside-2401',
    eventId: selected.id,
    eventType: 'pass',
    teamId: SYNTHETIC_TEAMS.northgate.id,
    playerId: SYNTHETIC_PLAYERS.northgate_8.id,
    isHomeTeam: true,
    provenance: 'synthetic',
    scoringMethodId: 'geometric_progression_v1',
    scoringMethodVersion: '1',
    scoringAssumptions: [],
    observed: {
      actionId: 'obs',
      kind: 'observed_pass',
      label: 'Observed',
      start: null,
      end: null,
      targetPlayerId: null,
      metrics: [],
      compositeScore: 12,
      rankable: true,
      limitations: [],
    },
    alternatives: [
      {
        actionId: 'alt-1',
        kind: 'hypothetical_pass',
        label: 'Alt',
        start: null,
        end: null,
        targetPlayerId: null,
        metrics: [],
        compositeScore: 10,
        rankable: true,
        limitations: [],
      },
    ],
    ranking: [],
    claims: [],
    completeness: {
      level: 'complete',
      hasCoordinates: true,
      hasAlignedFrame: true,
      teammatePositionsInFrame: 0,
      opponentPositionsInFrame: 0,
      alternativeCount: 1,
      missing: [],
      notes: [],
    },
    confidence: 'medium',
    limitations: [],
    context: {},
  },
  verificationResults: [
    {
      claimId: 'claim-1',
      submittedStatement: 'Statement',
      evidenceValidationStatus: 'verified',
      claimSupportStatus: 'not_assessed',
      reason: 'ok',
      evidence: [
        {
          kind: 'event',
          id: selected.id,
          matchId: 'm-northgate-riverside-2401',
          detail: null,
        },
      ],
      limitations: [],
      validationMethod: 'match_event_evidence_catalog_v1',
      validationScope:
        'evidence_reference_membership_and_registered_calculation_consistency',
    },
  ],
  narrative: {
    matchId: 'm-northgate-riverside-2401',
    eventId: selected.id,
    provenance: 'synthetic',
    english: {
      headline: 'Studio narrative headline EN',
      keyObservations: ['Observation from backend'],
      limitations: ['Synthetic only'],
    },
    arabic: {
      headline: 'عنوان السرد في الاستوديو',
      keyObservations: ['ملاحظة من الخادم'],
      limitations: ['اصطناعي فقط'],
    },
  },
}

const askGreetingReply = 'Ask the crew — grounded match analysis. I do not invent players or xG.'

function renderStudio(
  overrides: Partial<ComponentProps<typeof MatchStudioPanel>> = {},
) {
  const onSelectEvent = vi.fn()
  const onAskSelectedEvent = vi.fn()
  const onNarrativeRetry = vi.fn()
  const onOpenDecision = vi.fn()
  const onDownloadReport = vi.fn()
  const onPrevious = vi.fn()
  const onNext = vi.fn()
  const onClearAsk = vi.fn()
  const onAskQuestion = vi.fn()
  const onAskRetry = vi.fn()

  renderWithProviders(
    <MatchStudioPanel
      matchId="m-northgate-riverside-2401"
      events={events}
      selectedEventId={selected.id}
      selectedEvent={selected}
      homeTeam={SYNTHETIC_TEAMS.northgate}
      awayTeam={SYNTHETIC_TEAMS.riverside}
      players={players}
      canPrevious={false}
      canNext={true}
      onSelectEvent={onSelectEvent}
      onPrevious={onPrevious}
      onNext={onNext}
      onOpenDecision={onOpenDecision}
      onDownloadReport={onDownloadReport}
      narrativeState={{ status: 'idle' }}
      onAskSelectedEvent={onAskSelectedEvent}
      onNarrativeRetry={onNarrativeRetry}
      onClearAsk={onClearAsk}
      onAskQuestion={onAskQuestion}
      onAskRetry={onAskRetry}
      {...overrides}
    />,
  )

  return {
    onSelectEvent,
    onAskSelectedEvent,
    onNarrativeRetry,
    onOpenDecision,
    onDownloadReport,
    onPrevious,
    onNext,
    onClearAsk,
    onAskQuestion,
    onAskRetry,
  }
}

async function openAsk(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('tab', { name: STRINGS.en.matchStudioTabAsk }),
  )
}

describe('MatchStudioPanel', () => {
  it('switches between LIVE and ASK tabs with accessible selection', async () => {
    const user = userEvent.setup()
    renderStudio()

    const liveTab = screen.getByRole('tab', { name: STRINGS.en.matchStudioTabLive })
    const askTab = screen.getByRole('tab', { name: STRINGS.en.matchStudioTabAsk })
    expect(liveTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('match-studio-live')).toBeInTheDocument()

    await user.click(askTab)
    expect(askTab).toHaveAttribute('aria-selected', 'true')
    expect(liveTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('match-studio-ask')).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.askCrewHeading)).toBeInTheDocument()
  })

  it('renders LIVE feed from real event data with minute, type, and player', () => {
    renderStudio()
    const feed = screen.getByRole('listbox', {
      name: STRINGS.en.matchStudioLiveFeed,
    })
    expect(within(feed).getAllByRole('option').length).toBe(events.length)
    expect(
      screen.getByRole('option', { name: /Pass at 12', Selected/i }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(within(feed).getByText(/Jamie Cole/i)).toBeInTheDocument()
  })

  it('selecting a LIVE event calls shared replay selection', async () => {
    const user = userEvent.setup()
    const { onSelectEvent } = renderStudio()
    await user.click(screen.getByRole('option', { name: /Shot at 23'/i }))
    expect(onSelectEvent).toHaveBeenCalledWith('evt-ng-shot-23')
  })

  it('submits free-form ASK questions via the grounded ask API (button)', async () => {
    const user = userEvent.setup()
    const { onAskSelectedEvent, onAskQuestion } = renderStudio()
    await openAsk(user)
    await user.type(
      screen.getByLabelText(STRINGS.en.matchStudioAskQuestionLabel),
      'hi',
    )
    await user.click(
      screen.getByRole('button', {
        name: STRINGS.en.matchStudioAskSubmitFreeForm,
      }),
    )
    expect(onAskQuestion).toHaveBeenCalledWith('hi')
    expect(onAskSelectedEvent).not.toHaveBeenCalled()
  })

  it('submits free-form ASK questions on Enter', async () => {
    const user = userEvent.setup()
    const { onAskQuestion } = renderStudio()
    await openAsk(user)
    const input = screen.getByLabelText(STRINGS.en.matchStudioAskQuestionLabel)
    await user.type(input, 'hi{Enter}')
    expect(onAskQuestion).toHaveBeenCalledWith('hi')
  })

  it('shows a visible crew answer for a greeting response', async () => {
    const user = userEvent.setup()
    renderStudio({
      askCrewState: {
        status: 'ready',
        turns: [
          {
            id: 't1',
            question: 'hi',
            eventId: null,
            reply: askGreetingReply,
            error: null,
            createdAt: 1,
          },
        ],
      },
    })
    await openAsk(user)
    expect(screen.getByTestId('ask-user-message')).toHaveTextContent('hi')
    const answer = screen.getByTestId('ask-crew-answer')
    expect(answer).toHaveTextContent(/Ask the crew — grounded match analysis/i)
    expect(answer).toHaveTextContent(/not invent/i)
    expect(screen.queryByTestId('ask-empty')).not.toBeInTheDocument()
  })

  it('shows ask loading state while the crew request is in flight', async () => {
    const user = userEvent.setup()
    renderStudio({
      askCrewState: {
        status: 'loading',
        turns: [],
        pendingQuestion: 'hi',
      },
    })
    await openAsk(user)
    expect(screen.getByTestId('ask-pending-question')).toHaveTextContent('hi')
    expect(screen.getByTestId('ask-crew-loading')).toHaveTextContent(
      STRINGS.en.askCrewLoading,
    )
  })

  it('shows ask error with retry', async () => {
    const user = userEvent.setup()
    const { onAskRetry } = renderStudio({
      askCrewState: {
        status: 'error',
        turns: [],
        message: 'Ask timed out',
        lastQuestion: 'hi',
      },
    })
    await openAsk(user)
    expect(screen.getByTestId('ask-error-question')).toHaveTextContent('hi')
    expect(screen.getByTestId('ask-crew-error')).toHaveTextContent(/Ask timed out/i)
    await user.click(
      screen.getByRole('button', { name: STRINGS.en.decisionNarrativeRetry }),
    )
    expect(onAskRetry).toHaveBeenCalled()
  })

  it('rejects empty input without calling ask or narrative', async () => {
    const user = userEvent.setup()
    const nonDecision =
      events.find((e) => e.type === 'possession_change') ??
      events.find((e) => e.type === 'pressure')
    expect(nonDecision).toBeTruthy()
    const { onAskQuestion, onAskSelectedEvent } = renderStudio({
      selectedEvent: nonDecision!,
      selectedEventId: nonDecision!.id,
    })
    await openAsk(user)
    const submit = screen.getByRole('button', {
      name: STRINGS.en.matchStudioAskSubmitFreeForm,
    })
    expect(submit).toBeDisabled()
    expect(onAskQuestion).not.toHaveBeenCalled()
    expect(onAskSelectedEvent).not.toHaveBeenCalled()
  })

  it('clears ask conversation via Clear', async () => {
    const user = userEvent.setup()
    const { onClearAsk } = renderStudio({
      askCrewState: {
        status: 'ready',
        turns: [
          {
            id: 't1',
            question: 'hi',
            eventId: null,
            reply: askGreetingReply,
            error: null,
            createdAt: 1,
          },
        ],
      },
    })
    await openAsk(user)
    await user.click(
      screen.getAllByRole('button', { name: STRINGS.en.askCrewClear })[0]!,
    )
    expect(onClearAsk).toHaveBeenCalled()
  })

  it('asks about the selected decision event via the real narrative workflow', async () => {
    const user = userEvent.setup()
    const { onAskSelectedEvent } = renderStudio()
    await openAsk(user)
    await user.click(
      screen.getByRole('button', {
        name: STRINGS.en.matchStudioAskSelectedEvent,
      }),
    )
    expect(onAskSelectedEvent).toHaveBeenCalledTimes(1)
  })

  it('runs narrative suggestion for explain-decision and marks unsupported rows', async () => {
    const user = userEvent.setup()
    const { onAskSelectedEvent } = renderStudio()
    await openAsk(user)

    await user.click(screen.getByTestId('ask-suggestion-explain-decision'))
    expect(onAskSelectedEvent).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('ask-suggestion-press-higher'))
    expect(screen.getByTestId('ask-suggestion-unavailable')).toHaveTextContent(
      /does not invent/i,
    )
    expect(onAskSelectedEvent).toHaveBeenCalledTimes(1)
  })

  it('opens WHAT IF from the alternative-pass suggestion', async () => {
    const user = userEvent.setup()
    const { onOpenDecision } = renderStudio()
    await openAsk(user)
    await user.click(screen.getByTestId('ask-suggestion-alt-pass'))
    expect(onOpenDecision).toHaveBeenCalledWith(selected.id)
  })

  it('answers who-involved from local event facts only', async () => {
    const user = userEvent.setup()
    const { onAskSelectedEvent } = renderStudio()
    await openAsk(user)
    await user.click(screen.getByTestId('ask-suggestion-who-involved'))
    const facts = screen.getByTestId('ask-local-facts')
    expect(facts).toHaveTextContent(STRINGS.en.askCrewLocalFactsHeading)
    expect(facts).toHaveTextContent(/Jamie Cole/i)
    expect(onAskSelectedEvent).not.toHaveBeenCalled()
  })

  it('filters suggestions by Goals / Decisions / Passing / Tactics', async () => {
    const user = userEvent.setup()
    renderStudio()
    await openAsk(user)
    await user.click(
      screen.getByRole('button', { name: STRINGS.en.askCrewFilterTactics }),
    )
    const list = screen.getByTestId('ask-suggestion-list')
    expect(
      within(list).getByTestId('ask-suggestion-press-higher'),
    ).toBeInTheDocument()
    expect(
      within(list).queryByTestId('ask-suggestion-explain-decision'),
    ).not.toBeInTheDocument()
  })

  it('renders ASK success narrative with evidence, moment seek, and WHAT IF', async () => {
    const user = userEvent.setup()
    const { onSelectEvent, onOpenDecision } = renderStudio({
      narrativeState: {
        status: 'ready',
        matchId: narrativeResponse.matchId,
        eventId: narrativeResponse.eventId,
        response: narrativeResponse,
      },
      narrativeByEventId: { [selected.id]: narrativeResponse },
    })
    await openAsk(user)
    const block = screen.getByTestId('match-studio-ask-narrative')
    expect(
      within(block).getByText('Studio narrative headline EN'),
    ).toBeInTheDocument()
    expect(within(block).getByText(/Observation from backend/)).toBeInTheDocument()
    expect(within(block).getByText(/claim-1: Verified/)).toBeInTheDocument()
    expect(within(block).getByText(STRINGS.en.askAgentsTruthScope)).toBeInTheDocument()
    expect(within(block).getByText(STRINGS.en.askCrewAnswerFacts)).toBeInTheDocument()

    await user.click(
      within(block).getByRole('button', { name: STRINGS.en.askCrewViewMoment }),
    )
    expect(onSelectEvent).toHaveBeenCalledWith(selected.id)

    await user.click(
      within(block).getByRole('button', {
        name: STRINGS.en.askCrewCompareWhatIf,
      }),
    )
    expect(onOpenDecision).toHaveBeenCalledWith(selected.id)
  })

  it('shows loading, unavailable, and error+retry ASK states', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    renderStudio({
      narrativeState: {
        status: 'loading',
        matchId: 'm-northgate-riverside-2401',
        eventId: selected.id,
      },
    })
    await openAsk(user)
    expect(screen.getByTestId('ask-loading')).toHaveTextContent(
      STRINGS.en.askCrewLoading,
    )

    cleanup()
    renderStudio({
      narrativeState: {
        status: 'unavailable',
        matchId: 'm-northgate-riverside-2401',
        eventId: selected.id,
        message: 'Mock mode has no backend narrative.',
      },
    })
    await openAsk(user)
    expect(screen.getByTestId('ask-unavailable')).toHaveTextContent(
      /backend narrative is unavailable/i,
    )

    cleanup()
    renderStudio({
      narrativeState: {
        status: 'error',
        matchId: 'm-northgate-riverside-2401',
        eventId: selected.id,
        message: 'network failed',
      },
      onNarrativeRetry: retry,
    })
    await openAsk(user)
    expect(screen.getByTestId('ask-error')).toHaveTextContent(/network failed/i)
    await user.click(
      screen.getByRole('button', { name: STRINGS.en.decisionNarrativeRetry }),
    )
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('clears ASK answer state via Clear', async () => {
    const user = userEvent.setup()
    const { onClearAsk } = renderStudio({
      narrativeState: {
        status: 'ready',
        matchId: narrativeResponse.matchId,
        eventId: narrativeResponse.eventId,
        response: narrativeResponse,
      },
    })
    await openAsk(user)
    await user.click(
      screen.getAllByRole('button', { name: STRINGS.en.askCrewClear })[0]!,
    )
    expect(onClearAsk).toHaveBeenCalled()
  })

  it('shows empty LIVE state when no events exist', () => {
    renderStudio({
      events: [],
      selectedEventId: null,
      selectedEvent: null,
      canPrevious: false,
      canNext: false,
    })
    expect(screen.getByText(STRINGS.en.matchStudioLiveEmpty)).toBeInTheDocument()
  })

  it('keeps What If and Report actions wired', async () => {
    const user = userEvent.setup()
    const { onOpenDecision, onDownloadReport } = renderStudio()
    await user.click(
      screen.getByRole('button', { name: STRINGS.en.matchStudioWhatIf }),
    )
    expect(onOpenDecision).toHaveBeenCalledWith(selected.id)
    await user.click(
      screen.getByRole('button', { name: STRINGS.en.matchStudioReport }),
    )
    expect(onDownloadReport).toHaveBeenCalledTimes(1)
  })

  it('renders Arabic ASK crew heading and narrative in RTL locale', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('rematch.locale', 'ar')
    renderStudio({
      narrativeState: {
        status: 'ready',
        matchId: narrativeResponse.matchId,
        eventId: narrativeResponse.eventId,
        response: narrativeResponse,
      },
    })
    expect(
      screen.getByRole('tab', { name: STRINGS.ar.matchStudioTabLive }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('tab', { name: STRINGS.ar.matchStudioTabAsk }),
    )
    expect(screen.getByText(STRINGS.ar.askCrewHeading)).toBeInTheDocument()
    expect(
      screen.getByText('عنوان السرد في الاستوديو'),
    ).toBeInTheDocument()
  })

  it('matches composer text to a supported suggestion action', async () => {
    const user = userEvent.setup()
    const { onAskSelectedEvent } = renderStudio()
    await openAsk(user)
    await user.clear(
      screen.getByLabelText(STRINGS.en.matchStudioAskQuestionLabel),
    )
    await user.type(
      screen.getByLabelText(STRINGS.en.matchStudioAskQuestionLabel),
      STRINGS.en.askCrewSuggestExplainDecision,
    )
    await user.click(
      screen.getByRole('button', {
        name: STRINGS.en.matchStudioAskSubmitFreeForm,
      }),
    )
    expect(onAskSelectedEvent).toHaveBeenCalledTimes(1)
  })

  it('keeps sticky composer accessible in ASK panel', async () => {
    const user = userEvent.setup()
    renderStudio()
    await openAsk(user)
    expect(screen.getByTestId('ask-composer')).toBeInTheDocument()
    expect(
      screen.getByLabelText(STRINGS.en.matchStudioAskQuestionLabel),
    ).toBeEnabled()
  })
})

describe('MatchStudioPanel ASK with non-decision selection', () => {
  it('marks narrative suggestions unavailable for pressure events', async () => {
    const user = userEvent.setup()
    const pressure = events.find((e) => e.type === 'pressure') as MatchEvent
    renderStudio({
      selectedEventId: pressure.id,
      selectedEvent: pressure,
    })
    await openAsk(user)
    expect(screen.getByTestId('ask-suggestion-explain-decision')).toHaveAttribute(
      'data-unavailable',
      'true',
    )
    await user.click(screen.getByTestId('ask-suggestion-explain-decision'))
    expect(screen.getByTestId('ask-suggestion-unavailable')).toBeInTheDocument()
  })
})
