import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MatchEvent, MatchSummary } from '../../types'
import { renderWithProviders } from '../../test/render'
import { MatchMomentumChart } from './MatchMomentumChart'

afterEach(() => {
  cleanup()
})

const match: MatchSummary = {
  id: 'm1',
  competition: 'Demo Cup',
  status: 'finished',
  kickoffAt: '2024-01-01T12:00:00Z',
  homeTeam: { id: 'home', name: 'Home FC', shortName: 'HOM' },
  awayTeam: { id: 'away', name: 'Away FC', shortName: 'AWY' },
  score: { home: 1, away: 0 },
  provenance: 'synthetic',
  scenarioId: 'test',
}

const events: MatchEvent[] = [
  {
    id: 'goal-1',
    matchId: 'm1',
    type: 'shot',
    minute: 23,
    teamId: 'home',
    outcome: 'goal',
    provenance: 'synthetic',
  },
  {
    id: 'pass-1',
    matchId: 'm1',
    type: 'pass',
    minute: 40,
    teamId: 'home',
    provenance: 'synthetic',
  },
]

describe('MatchMomentumChart', () => {
  it('renders HT, legend, score, and seeks on marker click', async () => {
    const user = userEvent.setup()
    const onSelectEvent = vi.fn()
    renderWithProviders(
      <MatchMomentumChart
        match={match}
        events={events}
        selectedEventId="goal-1"
        onSelectEvent={onSelectEvent}
      />,
    )

    expect(screen.getByTestId('momentum-ht-label')).toHaveTextContent(/HT|استراحة/)
    expect(screen.getByText('Home FC')).toBeInTheDocument()
    expect(screen.getByText('Away FC')).toBeInTheDocument()
    expect(screen.getByLabelText(/Score 1–0|النتيجة 1–0/i)).toBeInTheDocument()
    expect(screen.getByTestId('momentum-playhead')).toBeInTheDocument()
    expect(screen.getByTestId('momentum-home-line')).toBeInTheDocument()

    await user.click(screen.getByTestId('momentum-marker-pass-1'))
    expect(onSelectEvent).toHaveBeenCalledWith('pass-1')
  })

  it('opens Decision Explorer on decision marker double-click', async () => {
    const user = userEvent.setup()
    const onOpenDecision = vi.fn()
    renderWithProviders(
      <MatchMomentumChart
        match={match}
        events={events}
        selectedEventId={null}
        onSelectEvent={vi.fn()}
        onOpenDecision={onOpenDecision}
      />,
    )

    await user.dblClick(screen.getByTestId('momentum-marker-pass-1'))
    expect(onOpenDecision).toHaveBeenCalledWith('pass-1')
  })
})
