import type { Team } from '../types'

/** Fictional clubs used by rematch-phase2-v1. */
export const SYNTHETIC_TEAMS = {
  northgate: {
    id: 'team-northgate',
    name: 'Northgate FC',
    shortName: 'NGFC',
  },
  riverside: {
    id: 'team-riverside',
    name: 'Riverside United',
    shortName: 'RIV',
  },
  harbor: {
    id: 'team-harbor',
    name: 'Harbor Athletic',
    shortName: 'HAR',
  },
  eastbridge: {
    id: 'team-eastbridge',
    name: 'Eastbridge City',
    shortName: 'EBC',
  },
  oakwood: {
    id: 'team-oakwood',
    name: 'Oakwood Wanderers',
    shortName: 'OAK',
  },
  silvermere: {
    id: 'team-silvermere',
    name: 'Silvermere FC',
    shortName: 'SIL',
  },
  crestvale: {
    id: 'team-crestvale',
    name: 'Crestvale Rovers',
    shortName: 'CRE',
  },
  milltown: {
    id: 'team-milltown',
    name: 'Milltown Athletic',
    shortName: 'MIL',
  },
  lakeside: {
    id: 'team-lakeside',
    name: 'Lakeside Town',
    shortName: 'LAK',
  },
  ironford: {
    id: 'team-ironford',
    name: 'Ironford United',
    shortName: 'IRN',
  },
  westfield: {
    id: 'team-westfield',
    name: 'Westfield Borough',
    shortName: 'WES',
  },
  portside: {
    id: 'team-portside',
    name: 'Portside Albion',
    shortName: 'POR',
  },
} as const satisfies Record<string, Team>

export type SyntheticTeamKey = keyof typeof SYNTHETIC_TEAMS

export const SYNTHETIC_TEAM_LIST: Team[] = Object.values(SYNTHETIC_TEAMS)
