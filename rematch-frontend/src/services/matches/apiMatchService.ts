import type {
  DashboardOverviewStat,
  DecisionAnalysis,
  DecisionNarrativeResponse,
  MatchDatasetInfo,
  MatchEvent,
  MatchFrame,
  MatchIntelligence,
  MatchSummary,
  Player,
  MetricsOperation,
  MetricsRange,
  SystemMetrics,
} from '../../types'
import {
  DecisionInsufficientEvidenceError,
  DecisionNarrativeUnavailableError,
  DecisionNotFoundError,
  MatchApiError,
  MatchNotFoundError,
  type ApiErrorBody,
  type MatchListFilters,
  type MatchService,
} from './types'

const API_PREFIX = '/api/v1'

interface Paginated<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

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

function buildMetricsQuery(filters: {
  range?: MetricsRange
  operation?: MetricsOperation
} = {}): string {
  const params = new URLSearchParams()
  if (filters.range) params.set('range', filters.range)
  if (filters.operation && filters.operation !== 'all') {
    params.set('operation', filters.operation)
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

async function readErrorBody(response: Response): Promise<ApiErrorBody | null> {
  try {
    return (await response.json()) as ApiErrorBody
  } catch {
    return null
  }
}

/**
 * HTTP match service. An empty base URL uses the same-origin SWA API proxy.
 * Errors are explicit — this never falls back to mock data.
 * Paths use the Phase 4/5 `/api/v1` contract and unwrap paginated `items`.
 */
export function createApiMatchService(baseUrl: string | undefined): MatchService {
  const root = baseUrl?.trim() ? trimBaseUrl(baseUrl.trim()) : ''

  async function request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<{ response: Response; body: T }> {
    let response: Response
    try {
      const headers = { ...(init?.headers ?? {}) }
      response = await fetch(`${root}${path}`, { ...init, headers })
    } catch (cause) {
      const detail =
        cause instanceof Error ? cause.message : 'network request failed'
      throw new MatchApiError(`Failed to reach match API: ${detail}`)
    }

    if (!response.ok) {
      const errorBody = await readErrorBody(response)
      const code = errorBody?.error?.code
      const message =
        errorBody?.error?.message ??
        `Match API error (${response.status}) for ${path}`
      throw new MatchApiError(message, response.status, code)
    }

    const body = await parseJson<T>(response)
    return { response, body }
  }

  async function getJson<T>(path: string): Promise<T> {
    const { body } = await request<T>(path)
    return body
  }

  return {
    async getDatasetInfo() {
      return getJson<MatchDatasetInfo>(`${API_PREFIX}/matches/dataset`)
    },

    async getOverviewStats() {
      return getJson<DashboardOverviewStat[]>(`${API_PREFIX}/matches/overview`)
    },

    async getSystemMetrics(filters) {
      return getJson<SystemMetrics>(
        `${API_PREFIX}/system-metrics${buildMetricsQuery(filters)}`,
      )
    },

    async getMatchIntelligence(matchId) {
      try {
        return await getJson<MatchIntelligence>(
          `${API_PREFIX}/matches/${encodeURIComponent(matchId)}/intelligence`,
        )
      } catch (error) {
        if (
          error instanceof MatchApiError &&
          (error.status === 404 || error.code === 'match_not_found')
        ) {
          throw new MatchNotFoundError(matchId)
        }
        throw error
      }
    },

    async getMatches(filters) {
      const page = await getJson<Paginated<MatchSummary>>(
        `${API_PREFIX}/matches${buildQuery(filters)}`,
      )
      return page.items
    },

    async getMatchById(matchId) {
      try {
        return await getJson<MatchSummary>(
          `${API_PREFIX}/matches/${encodeURIComponent(matchId)}`,
        )
      } catch (error) {
        if (
          error instanceof MatchApiError &&
          (error.status === 404 || error.code === 'match_not_found')
        ) {
          return null
        }
        throw error
      }
    },

    async getMatchEvents(matchId) {
      try {
        const page = await getJson<Paginated<MatchEvent>>(
          `${API_PREFIX}/matches/${encodeURIComponent(matchId)}/events`,
        )
        return page.items
      } catch (error) {
        if (
          error instanceof MatchApiError &&
          (error.status === 404 || error.code === 'match_not_found')
        ) {
          throw new MatchNotFoundError(matchId)
        }
        throw error
      }
    },

    async getMatchPlayers(matchId) {
      try {
        return await getJson<Player[]>(
          `${API_PREFIX}/matches/${encodeURIComponent(matchId)}/players`,
        )
      } catch (error) {
        if (
          error instanceof MatchApiError &&
          (error.status === 404 || error.code === 'match_not_found')
        ) {
          throw new MatchNotFoundError(matchId)
        }
        throw error
      }
    },

    async getMatchFrames(matchId) {
      try {
        const page = await getJson<Paginated<MatchFrame>>(
          `${API_PREFIX}/matches/${encodeURIComponent(matchId)}/frames`,
        )
        return page.items
      } catch (error) {
        if (
          error instanceof MatchApiError &&
          (error.status === 404 || error.code === 'match_not_found')
        ) {
          throw new MatchNotFoundError(matchId)
        }
        throw error
      }
    },

    async getDecisionAnalysis(matchId, eventId) {
      const path = `${API_PREFIX}/matches/${encodeURIComponent(matchId)}/events/${encodeURIComponent(eventId)}/decision-analysis`
      try {
        return await getJson<DecisionAnalysis>(path)
      } catch (error) {
        if (!(error instanceof MatchApiError)) {
          throw error
        }

        if (
          error.status === 404 &&
          (error.code === 'match_not_found' || !error.code)
        ) {
          throw new DecisionNotFoundError(
            'match_not_found',
            error.message,
            matchId,
            eventId,
          )
        }
        if (error.status === 404 && error.code === 'event_not_found') {
          throw new DecisionNotFoundError(
            'event_not_found',
            error.message,
            matchId,
            eventId,
          )
        }
        if (
          error.status === 422 &&
          (error.code === 'insufficient_evidence' || !error.code)
        ) {
          throw new DecisionInsufficientEvidenceError(
            error.message,
            matchId,
            eventId,
          )
        }
        throw error
      }
    },

    async getDecisionNarrative(matchId, eventId) {
      const path = `${API_PREFIX}/matches/${encodeURIComponent(matchId)}/events/${encodeURIComponent(eventId)}/decision-analysis/narrative`
      try {
        return await getJson<DecisionNarrativeResponse>(path)
      } catch (error) {
        if (
          error instanceof MatchApiError &&
          (error.status === 404 || error.status === 422)
        ) {
          throw new DecisionNarrativeUnavailableError(
            error.message,
            matchId,
            eventId,
          )
        }
        throw error
      }
    },
  }
}
