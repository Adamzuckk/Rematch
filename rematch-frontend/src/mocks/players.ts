import type { Player } from '../types'
import { SYNTHETIC_TEAMS } from './teams'

/**
 * Sparse player roster for scenario events only.
 * Not a full squad — do not treat missing players as data gaps to invent.
 */
export const SYNTHETIC_PLAYERS = {
  northgate_8: {
    id: 'player-northgate-8',
    name: 'Jamie Cole',
    teamId: SYNTHETIC_TEAMS.northgate.id,
    shirtNumber: 8,
  },
  northgate_9: {
    id: 'player-northgate-9',
    name: 'Omar Hale',
    teamId: SYNTHETIC_TEAMS.northgate.id,
    shirtNumber: 9,
  },
  northgate_11: {
    id: 'player-northgate-11',
    name: 'Leo Park',
    teamId: SYNTHETIC_TEAMS.northgate.id,
    shirtNumber: 11,
  },
  riverside_6: {
    id: 'player-riverside-6',
    name: 'Noah Greer',
    teamId: SYNTHETIC_TEAMS.riverside.id,
    shirtNumber: 6,
  },
  riverside_10: {
    id: 'player-riverside-10',
    name: 'Samir Quinn',
    teamId: SYNTHETIC_TEAMS.riverside.id,
    shirtNumber: 10,
  },
  oakwood_7: {
    id: 'player-oakwood-7',
    name: 'Theo Marsh',
    teamId: SYNTHETIC_TEAMS.oakwood.id,
    shirtNumber: 7,
  },
  oakwood_10: {
    id: 'player-oakwood-10',
    name: 'Kai Benton',
    teamId: SYNTHETIC_TEAMS.oakwood.id,
    shirtNumber: 10,
  },
  silvermere_1: {
    id: 'player-silvermere-1',
    name: 'Ellis Ward',
    teamId: SYNTHETIC_TEAMS.silvermere.id,
    shirtNumber: 1,
  },
} as const satisfies Record<string, Player>

export const SYNTHETIC_PLAYER_LIST: Player[] = Object.values(SYNTHETIC_PLAYERS)
