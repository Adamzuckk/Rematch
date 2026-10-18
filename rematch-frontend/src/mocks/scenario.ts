import type { DataProvenance, MatchDatasetInfo } from '../types'

/**
 * Deterministic synthetic catalogue for Phase 2.
 * The same seed always yields the same fixtures, teams, players, and events.
 * These are fictional clubs — not official Premier League (or any league) records.
 */
export const SYNTHETIC_SCENARIO_ID = 'rematch-phase2-v1' as const

export const SYNTHETIC_PROVENANCE: DataProvenance = 'synthetic'

export const SYNTHETIC_DATASET_INFO: MatchDatasetInfo = {
  scenarioId: SYNTHETIC_SCENARIO_ID,
  provenance: SYNTHETIC_PROVENANCE,
  description:
    'Fictional multi-competition match catalogue for local UI development and tests. Scores and minutes are demo values only.',
  matchCount: 6,
  limitations: [
    'Not official fixtures, standings, or league records.',
    'No possession, xG, or aggregate match statistics.',
    'Player/ball frames are not included — pitch shows event locations/paths only.',
    'Events exist only for a subset of matches and are sparse sample timelines.',
    'Overview “decision moments” figures are labelled demo placeholders.',
  ],
}
