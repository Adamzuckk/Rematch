import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { MatchEvent, MatchFrame, Team } from '../../types'
import { FootballPitch } from './FootballPitch'

afterEach(() => {
  cleanup()
})

const homeTeam: Team = { id: 'team-home', name: 'Home FC', shortName: 'HOM' }
const awayTeam: Team = { id: 'team-away', name: 'Away United', shortName: 'AWY' }

const passEvent: MatchEvent = {
  id: 'evt-pass',
  matchId: 'm1',
  type: 'pass',
  minute: 12,
  teamId: homeTeam.id,
  start: { x: 20, y: 40 },
  end: { x: 60, y: 55 },
  provenance: 'synthetic',
}

const shotEvent: MatchEvent = {
  id: 'evt-shot',
  matchId: 'm1',
  type: 'shot',
  minute: 18,
  teamId: awayTeam.id,
  location: { x: 80, y: 30 },
  provenance: 'synthetic',
}

const frameWithPlayers: MatchFrame = {
  id: 'frame-1',
  matchId: 'm1',
  eventId: 'evt-pass',
  players: [
    {
      playerId: 'player-home-1',
      teamId: homeTeam.id,
      position: { x: 30, y: 50 },
    },
    {
      playerId: 'player-away-1',
      teamId: awayTeam.id,
      position: { x: 70, y: 45 },
    },
  ],
  ball: { position: { x: 50, y: 50 } },
  provenance: 'synthetic',
}

describe('FootballPitch', () => {
  it('renders pitch markings and team legend', () => {
    render(
      <FootballPitch
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        label="Test pitch"
      />,
    )

    expect(screen.getByRole('img', { name: 'Test pitch' })).toBeInTheDocument()
    expect(screen.getByText('HOM')).toBeInTheDocument()
    expect(screen.getByText('AWY')).toBeInTheDocument()
    expect(screen.getByText(/No player frame/i)).toBeInTheDocument()
  })

  it('renders event path and location when coordinates exist', () => {
    render(
      <FootballPitch
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        selectedEvent={passEvent}
      />,
    )

    expect(screen.getByTestId('event-path')).toBeInTheDocument()
    expect(screen.getByTestId('event-location')).toBeInTheDocument()
  })

  it('highlights a selected hypothetical path and exposes a selectable player marker', () => {
    render(
      <FootballPitch
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        frame={frameWithPlayers}
        highlightedPath={{ start: { x: 20, y: 40 }, end: { x: 30, y: 50 } }}
        selectablePlayerIds={['player-home-1']}
        selectedPlayerId="player-home-1"
        selectPlayerLabel={(id) => `Pass to ${id}`}
      />,
    )
    expect(screen.getByTestId('selected-pass-path')).toHaveAttribute('x1', '210')
    expect(screen.getByRole('button', { name: 'Pass to player-home-1' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('omits player and ball markers when frame data is missing', () => {
    render(
      <FootballPitch
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        selectedEvent={passEvent}
        frame={null}
      />,
    )

    expect(screen.queryByTestId('player-marker')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ball-marker')).not.toBeInTheDocument()
  })

  it('renders accessible player and ball markers from controlled fixtures', () => {
    render(
      <FootballPitch
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        selectedEvent={passEvent}
        frame={frameWithPlayers}
      />,
    )

    const players = screen.getAllByTestId('player-marker')
    expect(players).toHaveLength(2)
    expect(
      within(players[0]!).getByRole('img', {
        name: /Player player-home-1, Home FC/i,
      }),
    ).toBeInTheDocument()
    expect(
      within(players[1]!).getByRole('img', {
        name: /Player player-away-1, Away United/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Ball' })).toBeInTheDocument()
  })

  it('skips invalid player coordinates instead of inventing positions', () => {
    const badFrame: MatchFrame = {
      id: 'frame-bad',
      matchId: 'm1',
      players: [
        {
          playerId: 'bad',
          teamId: homeTeam.id,
          position: { x: Number.NaN, y: 50 },
        },
        {
          playerId: 'ok',
          teamId: awayTeam.id,
          position: { x: 40, y: 40 },
        },
      ],
      provenance: 'synthetic',
    }

    render(
      <FootballPitch
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        frame={badFrame}
      />,
    )

    expect(screen.getAllByTestId('player-marker')).toHaveLength(1)
    expect(
      screen.getByRole('img', { name: /Player ok, Away United/i }),
    ).toBeInTheDocument()
  })

  it('keeps all finite frame markers inside the shared pitch coordinate system', () => {
    const edgeFrame: MatchFrame = {
      id: 'frame-edge',
      matchId: 'm1',
      players: [
        {
          playerId: 'edge-player',
          teamId: homeTeam.id,
          position: { x: -12, y: 120 },
        },
      ],
      ball: { position: { x: 130, y: -5 } },
      provenance: 'synthetic',
    }

    render(
      <FootballPitch
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        frame={edgeFrame}
      />,
    )

    expect(screen.getByTestId('player-marker')).toHaveAttribute(
      'transform',
      'translate(0, 0)',
    )
    expect(screen.getByTestId('ball-marker')).toHaveAttribute(
      'transform',
      'translate(1050, 680)',
    )
  })

  it('uses a fixed proportional viewBox, so marker coordinates do not depend on rendered width', () => {
    render(
      <FootballPitch
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        frame={frameWithPlayers}
        className="narrow-pitch"
      />,
    )

    const pitch = screen.getByRole('img', { name: 'Football pitch' })
    expect(pitch).toHaveAttribute('viewBox', '0 0 1050 680')
    expect(pitch).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet')
    expect(screen.getByTestId('ball-marker')).toHaveAttribute(
      'transform',
      'translate(525, 340)',
    )
  })

  it('replaces animated overlays when the selected event changes and removes them on cleanup', () => {
    const { rerender, unmount } = render(
      <FootballPitch
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        selectedEvent={passEvent}
      />,
    )

    const oldPath = screen.getByTestId('event-path')
    const oldLocation = screen.getByTestId('event-location')

    rerender(
      <FootballPitch
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        selectedEvent={shotEvent}
      />,
    )

    const newLocation = screen.getByTestId('event-location')
    expect(screen.queryByTestId('event-path')).not.toBeInTheDocument()
    expect(newLocation).toHaveAttribute('transform', 'translate(840, 476)')
    expect(newLocation).not.toBe(oldLocation)
    expect(oldLocation.isConnected).toBe(false)
    expect(oldPath.isConnected).toBe(false)

    unmount()
    expect(newLocation.isConnected).toBe(false)
  })

  it('restarts the selected-path entry motion when its geometry changes', () => {
    const { rerender } = render(
      <FootballPitch
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        highlightedPath={{ start: { x: 20, y: 40 }, end: { x: 30, y: 50 } }}
      />,
    )
    const firstPath = screen.getByTestId('selected-pass-path')

    rerender(
      <FootballPitch
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        highlightedPath={{ start: { x: 20, y: 40 }, end: { x: 70, y: 60 } }}
      />,
    )

    const nextPath = screen.getByTestId('selected-pass-path')
    expect(nextPath).not.toBe(firstPath)
    expect(firstPath.isConnected).toBe(false)
    expect(nextPath).toHaveAttribute('x2', '735')
  })
})
