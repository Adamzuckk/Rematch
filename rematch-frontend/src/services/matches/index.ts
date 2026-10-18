import { createApiMatchService } from './apiMatchService'
import { mockMatchService } from './mockMatchService'
import {
  MatchServiceConfigError,
  type MatchService,
} from './types'

export type {
  MatchListFilters,
  MatchService,
} from './types'
export {
  MatchApiError,
  MatchNotFoundError,
  MatchServiceConfigError,
} from './types'
export { mockMatchService, filterSyntheticMatches } from './mockMatchService'
export { createApiMatchService } from './apiMatchService'

export type MatchDataSource = 'mock' | 'api'

function readDataSource(): MatchDataSource {
  const raw = import.meta.env.VITE_MATCH_DATA_SOURCE
  if (raw === 'api' || raw === 'mock') {
    return raw
  }
  return 'mock'
}

/**
 * Creates the active match service.
 * Default: mock (synthetic). Set VITE_MATCH_DATA_SOURCE=api and
 * VITE_API_BASE_URL to use the HTTP implementation — no silent mock fallback.
 */
export function createMatchService(
  source: MatchDataSource = readDataSource(),
): MatchService {
  if (source === 'api') {
    return createApiMatchService(import.meta.env.VITE_API_BASE_URL)
  }
  if (source === 'mock') {
    return mockMatchService
  }
  throw new MatchServiceConfigError(
    `Unknown match data source: ${String(source)}`,
  )
}

/** Shared app-wide instance (mock by default). */
export const matchService: MatchService = createMatchService()
