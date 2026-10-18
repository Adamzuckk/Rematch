import type { MatchEvent } from '../types'
import { SYNTHETIC_PLAYERS } from './players'
import { SYNTHETIC_PROVENANCE } from './scenario'
import { SYNTHETIC_TEAMS } from './teams'

const NORTHGATE_MATCH_ID = 'm-northgate-riverside-2401'
const OAKWOOD_MATCH_ID = 'm-oakwood-silvermere-2403'

/**
 * Sparse, deterministic event samples for a subset of fixtures.
 * Coordinates use the 0–100 pitch convention documented in types/coordinates.ts.
 * Matches without entries here correctly return an empty event list.
 */
export const SYNTHETIC_EVENTS: MatchEvent[] = [
  {
    id: 'evt-ng-pass-12',
    matchId: NORTHGATE_MATCH_ID,
    type: 'pass',
    minute: 12,
    occurredAt: '2026-10-18T18:12:00.000Z',
    teamId: SYNTHETIC_TEAMS.northgate.id,
    playerId: SYNTHETIC_PLAYERS.northgate_8.id,
    receiverId: SYNTHETIC_PLAYERS.northgate_11.id,
    start: { x: 42, y: 48 },
    end: { x: 58, y: 62 },
    outcome: 'complete',
    provenance: SYNTHETIC_PROVENANCE,
  },
  {
    id: 'evt-ng-shot-23',
    matchId: NORTHGATE_MATCH_ID,
    type: 'shot',
    minute: 23,
    occurredAt: '2026-10-18T18:23:00.000Z',
    teamId: SYNTHETIC_TEAMS.northgate.id,
    playerId: SYNTHETIC_PLAYERS.northgate_9.id,
    location: { x: 88, y: 52 },
    outcome: 'goal',
    provenance: SYNTHETIC_PROVENANCE,
  },
  {
    id: 'evt-ng-pressure-41',
    matchId: NORTHGATE_MATCH_ID,
    type: 'pressure',
    minute: 41,
    occurredAt: '2026-10-18T18:41:00.000Z',
    teamId: SYNTHETIC_TEAMS.riverside.id,
    playerId: SYNTHETIC_PLAYERS.riverside_6.id,
    location: { x: 55, y: 40 },
    provenance: SYNTHETIC_PROVENANCE,
  },
  {
    id: 'evt-ng-possession-52',
    matchId: NORTHGATE_MATCH_ID,
    type: 'possession_change',
    minute: 52,
    occurredAt: '2026-10-18T18:52:00.000Z',
    teamId: SYNTHETIC_TEAMS.riverside.id,
    gainedByTeamId: SYNTHETIC_TEAMS.riverside.id,
    provenance: SYNTHETIC_PROVENANCE,
  },
  {
    id: 'evt-ng-shot-61',
    matchId: NORTHGATE_MATCH_ID,
    type: 'shot',
    minute: 61,
    occurredAt: '2026-10-18T19:01:00.000Z',
    teamId: SYNTHETIC_TEAMS.riverside.id,
    playerId: SYNTHETIC_PLAYERS.riverside_10.id,
    location: { x: 14, y: 47 },
    outcome: 'goal',
    provenance: SYNTHETIC_PROVENANCE,
  },
  {
    id: 'evt-ng-carry-64',
    matchId: NORTHGATE_MATCH_ID,
    type: 'carry',
    minute: 64,
    occurredAt: '2026-10-18T19:04:00.000Z',
    teamId: SYNTHETIC_TEAMS.northgate.id,
    playerId: SYNTHETIC_PLAYERS.northgate_11.id,
    start: { x: 35, y: 30 },
    end: { x: 52, y: 44 },
    provenance: SYNTHETIC_PROVENANCE,
  },
  {
    id: 'evt-oak-pass-18',
    matchId: OAKWOOD_MATCH_ID,
    type: 'pass',
    minute: 18,
    occurredAt: '2026-10-17T15:18:00.000Z',
    teamId: SYNTHETIC_TEAMS.oakwood.id,
    playerId: SYNTHETIC_PLAYERS.oakwood_7.id,
    receiverId: SYNTHETIC_PLAYERS.oakwood_10.id,
    start: { x: 60, y: 55 },
    end: { x: 78, y: 48 },
    outcome: 'complete',
    provenance: SYNTHETIC_PROVENANCE,
  },
  {
    id: 'evt-oak-shot-33',
    matchId: OAKWOOD_MATCH_ID,
    type: 'shot',
    minute: 33,
    occurredAt: '2026-10-17T15:33:00.000Z',
    teamId: SYNTHETIC_TEAMS.oakwood.id,
    playerId: SYNTHETIC_PLAYERS.oakwood_10.id,
    location: { x: 91, y: 50 },
    outcome: 'goal',
    provenance: SYNTHETIC_PROVENANCE,
  },
  {
    id: 'evt-oak-tackle-55',
    matchId: OAKWOOD_MATCH_ID,
    type: 'tackle',
    minute: 55,
    occurredAt: '2026-10-17T15:55:00.000Z',
    teamId: SYNTHETIC_TEAMS.silvermere.id,
    playerId: SYNTHETIC_PLAYERS.silvermere_1.id,
    location: { x: 22, y: 60 },
    outcome: 'won',
    provenance: SYNTHETIC_PROVENANCE,
  },
]

export function getSyntheticEventsForMatch(matchId: string): MatchEvent[] {
  return SYNTHETIC_EVENTS.filter((event) => event.matchId === matchId)
}
