import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MatchEvent, MatchSummary } from '../../types'
import { STRINGS } from '../../i18n/strings'
import { renderWithProviders } from '../../test/render'
import { MatchReplayTimeline } from './MatchReplayTimeline'

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
  score: { home: 1, away: 1 },
  provenance: 'synthetic',
  scenarioId: 'test',
}

const events: MatchEvent[] = [
  {
    id: 'e1',
    matchId: 'm1',
    type: 'pass',
    minute: 12,
    teamId: 'home',
    provenance: 'synthetic',
  },
  {
    id: 'e2',
    matchId: 'm1',
    type: 'shot',
    minute: 50,
    teamId: 'away',
    outcome: 'goal',
    provenance: 'synthetic',
  },
]

describe('MatchReplayTimeline', () => {
  it('plays, seeks, shows HT, and switches speed/mode', async () => {
    const user = userEvent.setup()
    const onTogglePlay = vi.fn()
    const onSelectEvent = vi.fn()
    const onSeekIndex = vi.fn()
    const onSpeed = vi.fn()
    const onMode = vi.fn()

    renderWithProviders(
      <MatchReplayTimeline
        match={match}
        events={events}
        selectedEventId="e1"
        playing={false}
        speed={1}
        mode="full"
        onTogglePlay={onTogglePlay}
        onSpeed={onSpeed}
        onMode={onMode}
        onSelectEvent={onSelectEvent}
        onSeekIndex={onSeekIndex}
      />,
    )

    expect(screen.getByTestId('replay-ht-marker')).toBeInTheDocument()
    expect(screen.getByTestId('replay-playhead')).toBeInTheDocument()
    expect(screen.getByTestId('replay-position')).toHaveTextContent('1/2')

    await user.click(screen.getByRole('button', { name: STRINGS.en.replayPlay }))
    expect(onTogglePlay).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '4x' }))
    expect(onSpeed).toHaveBeenCalledWith(4)

    await user.click(
      screen.getByRole('button', { name: STRINGS.en.replayModeHighlights }),
    )
    expect(onMode).toHaveBeenCalledWith('highlights')

    await user.click(screen.getByTestId('replay-marker-e2'))
    expect(onSelectEvent).toHaveBeenCalledWith('e2')
    expect(onSeekIndex).toHaveBeenCalledWith(1)
  })

  it('reflects play/pause and position when props update', () => {
    renderWithProviders(
      <MatchReplayTimeline
        match={match}
        events={events}
        selectedEventId="e2"
        playing
        speed={4}
        mode="full"
        onTogglePlay={vi.fn()}
        onSpeed={vi.fn()}
        onMode={vi.fn()}
        onSelectEvent={vi.fn()}
        onSeekIndex={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: STRINGS.en.replayPause }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('replay-position')).toHaveTextContent('2/2')
    expect(screen.getByRole('button', { name: '4x' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('stays usable on a narrow viewport width', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    })
    renderWithProviders(
      <MatchReplayTimeline
        match={match}
        events={events}
        selectedEventId="e1"
        playing={false}
        speed={1}
        mode="full"
        onTogglePlay={vi.fn()}
        onSpeed={vi.fn()}
        onMode={vi.fn()}
        onSelectEvent={vi.fn()}
        onSeekIndex={vi.fn()}
      />,
    )

    const root = screen.getByTestId('match-replay-timeline')
    expect(root).toBeInTheDocument()
    expect(screen.getByTestId('replay-timeline-track')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '16x' })).toBeInTheDocument()
  })
})
