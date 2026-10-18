import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MatchEvent } from '../../types'
import { sortMatchEvents } from '../../lib/pitch'
import { EventTimeline } from './EventTimeline'

afterEach(() => {
  cleanup()
})

const events: MatchEvent[] = sortMatchEvents([
  {
    id: 'evt-2',
    matchId: 'm1',
    type: 'shot',
    minute: 23,
    provenance: 'synthetic',
    location: { x: 80, y: 50 },
  },
  {
    id: 'evt-1',
    matchId: 'm1',
    type: 'pass',
    minute: 12,
    provenance: 'synthetic',
    start: { x: 10, y: 10 },
    end: { x: 20, y: 20 },
  },
  {
    id: 'evt-3',
    matchId: 'm1',
    type: 'pressure',
    minute: 41,
    provenance: 'synthetic',
    location: { x: 40, y: 40 },
  },
])

describe('EventTimeline', () => {
  it('renders sorted events with types and minutes', () => {
    render(
      <EventTimeline
        events={events}
        selectedEventId="evt-1"
        onSelect={() => {}}
        onPrevious={() => {}}
        onNext={() => {}}
        canPrevious={false}
        canNext
      />,
    )

    expect(screen.getByText("12'")).toBeInTheDocument()
    expect(screen.getByText('Pass')).toBeInTheDocument()
    expect(screen.getByText("23'")).toBeInTheDocument()
    expect(screen.getByText('Shot')).toBeInTheDocument()
  })

  it('marks the selected event and supports selection', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <EventTimeline
        events={events}
        selectedEventId="evt-1"
        onSelect={onSelect}
        onPrevious={() => {}}
        onNext={() => {}}
        canPrevious={false}
        canNext
      />,
    )

    expect(
      screen.getByRole('option', { name: /Pass at 12', Selected/i }),
    ).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('option', { name: /Shot at 23'/i }))
    expect(onSelect).toHaveBeenCalledWith('evt-2')
  })

  it('disables Previous/Next at list boundaries', () => {
    const { rerender } = render(
      <EventTimeline
        events={events}
        selectedEventId="evt-1"
        onSelect={() => {}}
        onPrevious={() => {}}
        onNext={() => {}}
        canPrevious={false}
        canNext
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Previous event' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next event' })).toBeEnabled()

    rerender(
      <EventTimeline
        events={events}
        selectedEventId="evt-3"
        onSelect={() => {}}
        onPrevious={() => {}}
        onNext={() => {}}
        canPrevious
        canNext={false}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Previous event' }),
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next event' })).toBeDisabled()
  })

  it('shows an empty state when there are no events', () => {
    render(
      <EventTimeline
        events={[]}
        selectedEventId={null}
        onSelect={() => {}}
        onPrevious={() => {}}
        onNext={() => {}}
        canPrevious={false}
        canNext={false}
      />,
    )

    expect(
      screen.getByText(/No events available for this match/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Previous event' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next event' })).toBeDisabled()
  })
})
