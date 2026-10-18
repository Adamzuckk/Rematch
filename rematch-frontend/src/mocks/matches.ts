import type { MatchSummary } from '../types'
import { SYNTHETIC_PROVENANCE, SYNTHETIC_SCENARIO_ID } from './scenario'
import { SYNTHETIC_TEAMS } from './teams'

/**
 * Deterministic match catalogue for rematch-phase2-v1.
 * Same order and IDs every time — do not shuffle or invent extra stats.
 */
export const SYNTHETIC_MATCHES: MatchSummary[] = [
  {
    id: 'm-northgate-riverside-2401',
    competition: 'Metro Premier Cup',
    homeTeam: SYNTHETIC_TEAMS.northgate,
    awayTeam: SYNTHETIC_TEAMS.riverside,
    status: 'live',
    kickoffAt: '2026-10-18T18:00:00.000Z',
    score: { home: 1, away: 1 },
    minute: 67,
    venue: 'Northgate Arena',
    provenance: SYNTHETIC_PROVENANCE,
    scenarioId: SYNTHETIC_SCENARIO_ID,
  },
  {
    id: 'm-harbor-eastbridge-2402',
    competition: 'Coastal League',
    homeTeam: SYNTHETIC_TEAMS.harbor,
    awayTeam: SYNTHETIC_TEAMS.eastbridge,
    status: 'live',
    kickoffAt: '2026-10-18T19:15:00.000Z',
    score: { home: 2, away: 0 },
    minute: 34,
    venue: 'Harbor Docklands',
    provenance: SYNTHETIC_PROVENANCE,
    scenarioId: SYNTHETIC_SCENARIO_ID,
  },
  {
    id: 'm-oakwood-silvermere-2403',
    competition: 'Metro Premier Cup',
    homeTeam: SYNTHETIC_TEAMS.oakwood,
    awayTeam: SYNTHETIC_TEAMS.silvermere,
    status: 'finished',
    kickoffAt: '2026-10-17T15:00:00.000Z',
    score: { home: 3, away: 1 },
    venue: 'Oakwood Park',
    provenance: SYNTHETIC_PROVENANCE,
    scenarioId: SYNTHETIC_SCENARIO_ID,
  },
  {
    id: 'm-crestvale-milltown-2404',
    competition: 'Northern Circuit',
    homeTeam: SYNTHETIC_TEAMS.crestvale,
    awayTeam: SYNTHETIC_TEAMS.milltown,
    status: 'finished',
    kickoffAt: '2026-10-16T20:00:00.000Z',
    score: { home: 0, away: 0 },
    venue: 'Crestvale Ground',
    provenance: SYNTHETIC_PROVENANCE,
    scenarioId: SYNTHETIC_SCENARIO_ID,
  },
  {
    id: 'm-lakeside-ironford-2405',
    competition: 'Coastal League',
    homeTeam: SYNTHETIC_TEAMS.lakeside,
    awayTeam: SYNTHETIC_TEAMS.ironford,
    status: 'upcoming',
    kickoffAt: '2026-10-20T17:30:00.000Z',
    venue: 'Lakeside Basin',
    provenance: SYNTHETIC_PROVENANCE,
    scenarioId: SYNTHETIC_SCENARIO_ID,
  },
  {
    id: 'm-westfield-portside-2406',
    competition: 'Metro Premier Cup',
    homeTeam: SYNTHETIC_TEAMS.westfield,
    awayTeam: SYNTHETIC_TEAMS.portside,
    status: 'upcoming',
    kickoffAt: '2026-10-21T19:45:00.000Z',
    venue: 'Westfield Terrace',
    provenance: SYNTHETIC_PROVENANCE,
    scenarioId: SYNTHETIC_SCENARIO_ID,
  },
]

/** @deprecated Prefer SYNTHETIC_MATCHES; kept as an alias for Phase 1 call sites. */
export const DEMO_MATCHES = SYNTHETIC_MATCHES

/** @deprecated Prefer SYNTHETIC_SCENARIO_ID from scenario.ts */
export const SYNTHETIC_DATA_SEED = SYNTHETIC_SCENARIO_ID
