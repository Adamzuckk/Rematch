import type { DashboardOverviewStat } from '../types'
import { SYNTHETIC_MATCHES } from './matches'

/**
 * Demo-only overview chips for the Dashboard.
 * Values are derived from the synthetic catalogue or explicitly labelled placeholders.
 */
export const SYNTHETIC_OVERVIEW_STATS: DashboardOverviewStat[] = [
  {
    id: 'stat-matches',
    label: 'Demo matches',
    value: String(SYNTHETIC_MATCHES.length),
    hint: 'Synthetic catalogue size — not a live feed count',
    isDemoValue: true,
  },
  {
    id: 'stat-live',
    label: 'Live (demo)',
    value: String(SYNTHETIC_MATCHES.filter((m) => m.status === 'live').length),
    hint: 'From seeded fixtures only',
    isDemoValue: true,
  },
  {
    id: 'stat-decisions',
    label: 'Decision moments',
    value: '12',
    hint: 'Placeholder demo count — engine not connected',
    isDemoValue: true,
  },
  {
    id: 'stat-coverage',
    label: 'Operational telemetry',
    value: '—',
    hint: 'Static mock data has no operational history; use API mode for System Metrics',
    isDemoValue: true,
  },
]

/** @deprecated Prefer SYNTHETIC_OVERVIEW_STATS */
export const DEMO_OVERVIEW_STATS = SYNTHETIC_OVERVIEW_STATS
