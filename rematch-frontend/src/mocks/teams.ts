import type { Team } from '../types'

/** Fictional clubs used by rematch-phase2-v1 / rich phase4 catalogue. */
export const SYNTHETIC_TEAMS = {
  northgate: {
    id: 'team-northgate',
    name: 'Northgate FC',
    shortName: 'NGFC',
    coachName: 'Helena Crowe',
  },
  riverside: {
    id: 'team-riverside',
    name: 'Riverside United',
    shortName: 'RIV',
    coachName: 'Marcus Bellini',
  },
  harbor: {
    id: 'team-harbor',
    name: 'Harbor Athletic',
    shortName: 'HAR',
    coachName: 'Sofia Marchetti',
  },
  eastbridge: {
    id: 'team-eastbridge',
    name: 'Eastbridge City',
    shortName: 'EBC',
    coachName: 'Jonah Pike',
  },
  oakwood: {
    id: 'team-oakwood',
    name: 'Oakwood Wanderers',
    shortName: 'OAK',
    coachName: 'Ibrahim Saleh',
  },
  silvermere: {
    id: 'team-silvermere',
    name: 'Silvermere FC',
    shortName: 'SIL',
    coachName: 'Clara Voss',
  },
  crestvale: {
    id: 'team-crestvale',
    name: 'Crestvale Rovers',
    shortName: 'CRE',
    coachName: 'Tomasz Reid',
  },
  milltown: {
    id: 'team-milltown',
    name: 'Milltown Athletic',
    shortName: 'MIL',
    coachName: 'Aya Nakamura',
  },
  lakeside: {
    id: 'team-lakeside',
    name: 'Lakeside Town',
    shortName: 'LAK',
    coachName: 'Felix Ortega',
  },
  ironford: {
    id: 'team-ironford',
    name: 'Ironford United',
    shortName: 'IRN',
    coachName: 'Nora Lindqvist',
  },
  westfield: {
    id: 'team-westfield',
    name: 'Westfield Borough',
    shortName: 'WES',
    coachName: 'Darius Cole',
  },
  portside: {
    id: 'team-portside',
    name: 'Portside Albion',
    shortName: 'POR',
    coachName: 'Miriam Haas',
  },
} as const satisfies Record<string, Team>

export type SyntheticTeamKey = keyof typeof SYNTHETIC_TEAMS

export const SYNTHETIC_TEAM_LIST: Team[] = Object.values(SYNTHETIC_TEAMS)
