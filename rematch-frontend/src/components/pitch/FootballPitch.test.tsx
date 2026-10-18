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
})
