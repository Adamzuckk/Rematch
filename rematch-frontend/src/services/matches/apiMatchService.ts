import type {
  DashboardOverviewStat,
  MatchDatasetInfo,
  MatchEvent,
  MatchFrame,
  MatchSummary,
  Player,
} from '../../types'
import {
  MatchApiError,
  MatchNotFoundError,
  MatchServiceConfigError,
  type MatchListFilters,
  type MatchService,
} from './types'

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function buildQuery(filters: MatchListFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.query?.trim()) {
    params.set('q', filters.query.trim())
  }
  if (filters.status && filters.status !== 'all') {
    params.set('status', filters.status)
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

async function parseJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    throw new MatchApiError(
      `API returned non-JSON response (${response.status})`,
      response.status,
    )
  }
}

/**
 * HTTP match service. Requires VITE_API_BASE_URL.
 * Errors are explicit — this never falls back to mock data.
 */
export function createApiMatchService(baseUrl: string | undefined): MatchService {
  if (!baseUrl?.trim()) {
    throw new MatchServiceConfigError(
      'VITE_MATCH_DATA_SOURCE=api requires VITE_API_BASE_URL to be set.',
    )
  }

  const root = trimBaseUrl(baseUrl.trim())

  async function request<T>(path: string): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${root}${path}`)
    } catch (cause) {
      const detail =
        cause instanceof Error ? cause.message : 'network request failed'
      throw new MatchApiError(`Failed to reach match API: ${detail}`)
    }

    if (response.status === 404) {
      throw new MatchNotFoundError(path)
    }

    if (!response.ok) {
      throw new MatchApiError(
        `Match API error (${response.status}) for ${path}`,
        response.status,
      )
    }

    return parseJson<T>(response)
  }

  return {
    async getDatasetInfo() {
      return request<MatchDatasetInfo>('/api/matches/dataset')
    },

    async getOverviewStats() {
      return request<DashboardOverviewStat[]>('/api/matches/overview')
    },

    async getMatches(filters) {
      return request<MatchSummary[]>(`/api/matches${buildQuery(filters)}`)
    },

    async getMatchById(matchId) {
      try {
        return await request<MatchSummary>(
          `/api/matches/${encodeURIComponent(matchId)}`,
        )
      } catch (error) {
        if (error instanceof MatchNotFoundError) {
          return null
        }
        throw error
      }
    },

    async getMatchEvents(matchId) {
      try {
        return await request<MatchEvent[]>(
          `/api/matches/${encodeURIComponent(matchId)}/events`,
        )
      } catch (error) {
        if (error instanceof MatchNotFoundError) {
          throw new MatchNotFoundError(matchId)
        }
        throw error
      }
    },

    async getMatchPlayers(matchId) {
      try {
        return await request<Player[]>(
          `/api/matches/${encodeURIComponent(matchId)}/players`,
        )
      } catch (error) {
        if (error instanceof MatchNotFoundError) {
          throw new MatchNotFoundError(matchId)
        }
        throw error
      }
    },

    async getMatchFrames(matchId) {
      try {
        return await request<MatchFrame[]>(
          `/api/matches/${encodeURIComponent(matchId)}/frames`,
        )
      } catch (error) {
        if (error instanceof MatchNotFoundError) {
          throw new MatchNotFoundError(matchId)
        }
        throw error
      }
    },
  }
}
