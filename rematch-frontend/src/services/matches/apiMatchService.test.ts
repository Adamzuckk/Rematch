import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiMatchService } from './apiMatchService'
import {
  DecisionInsufficientEvidenceError,
  DecisionNarrativeUnavailableError,
  DecisionNotFoundError,
  MatchApiError,
  MatchServiceConfigError,
} from './types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createApiMatchService decision analysis', () => {
  it('requires VITE_API_BASE_URL', () => {
    expect(() => createApiMatchService(undefined)).toThrow(
      MatchServiceConfigError,
    )
  })

  it('GETs /api/v1/.../decision-analysis and returns the body', async () => {
    const analysis = {
      matchId: 'm-1',
      eventId: 'evt-1',
      eventType: 'carry',
      teamId: null,
      playerId: null,
      isHomeTeam: true,
      scoringMethodId: 'geometric_progression_v1',
      scoringMethodVersion: '1.0.0',
      scoringAssumptions: [],
      observed: {
        actionId: 'observed:evt-1',
        kind: 'observed_carry',
        label: 'Observed carry',
        start: null,
        end: null,
        targetPlayerId: null,
        metrics: [],
        compositeScore: 12,
        rankable: true,
        limitations: [],
      },
      alternatives: [],
      ranking: [],
      claims: [],
      completeness: {
        level: 'partial',
        hasCoordinates: true,
        hasAlignedFrame: false,
        teammatePositionsInFrame: 0,
        opponentPositionsInFrame: 0,
        alternativeCount: 0,
        missing: [],
        notes: [],
      },
      confidence: 'low',
      limitations: [],
      context: {},
      provenance: 'synthetic',
    }

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(analysis))
    vi.stubGlobal('fetch', fetchMock)

    const service = createApiMatchService('http://localhost:8000')
    const result = await service.getDecisionAnalysis('m-1', 'evt-1')

    expect(result.eventId).toBe('evt-1')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/matches/m-1/events/evt-1/decision-analysis',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
  })

  it('maps 422 insufficient_evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'insufficient_evidence',
              message: 'Pass requires start and end coordinates',
            },
          },
          422,
        ),
      ),
    )

    const service = createApiMatchService('http://localhost:8000/')
    await expect(
      service.getDecisionAnalysis('m-1', 'evt-bad'),
    ).rejects.toBeInstanceOf(DecisionInsufficientEvidenceError)
  })

  it('maps 404 event_not_found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'event_not_found',
              message: 'Event not found: evt-x',
            },
          },
          404,
        ),
      ),
    )

    const service = createApiMatchService('http://localhost:8000')
    await expect(
      service.getDecisionAnalysis('m-1', 'evt-x'),
    ).rejects.toMatchObject({
      name: 'DecisionNotFoundError',
      code: 'event_not_found',
    })
  })

  it('maps network failure without falling back to mock', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )

    const service = createApiMatchService('http://localhost:8000')
    await expect(
      service.getDecisionAnalysis('m-1', 'evt-1'),
    ).rejects.toBeInstanceOf(MatchApiError)
  })

  it('GETs the composed narrative endpoint without recalculating its nested analysis', async () => {
    const narrative = {
      matchId: 'm-1',
      eventId: 'evt-1',
      provenance: 'synthetic',
      analysis: { eventId: 'evt-1', ranking: [{ rank: 1, compositeScore: 15 }] },
      verificationResults: [
        {
          claimId: 'c-1',
          evidenceValidationStatus: 'verified',
          claimSupportStatus: 'not_assessed',
        },
      ],
      narrative: {
        matchId: 'm-1',
        eventId: 'evt-1',
        provenance: 'synthetic',
        english: { headline: 'English headline', keyObservations: [], limitations: [] },
        arabic: { headline: 'عنوان عربي', keyObservations: [], limitations: [] },
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(narrative))
    vi.stubGlobal('fetch', fetchMock)

    const service = createApiMatchService('http://localhost:8000')
    const result = await service.getDecisionNarrative('m-1', 'evt-1')

    expect(result).toEqual(narrative)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/matches/m-1/events/evt-1/decision-analysis/narrative',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
  })

  it('marks unavailable narrative responses explicitly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: 'insufficient_evidence', message: 'No narrative input' } },
          422,
        ),
      ),
    )

    const service = createApiMatchService('http://localhost:8000')
    await expect(
      service.getDecisionNarrative('m-1', 'evt-1'),
    ).rejects.toBeInstanceOf(DecisionNarrativeUnavailableError)
  })

  it('unwraps paginated match list items from /api/v1', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              id: 'm-1',
              competition: 'Demo',
              homeTeam: { id: 'h', name: 'Home' },
              awayTeam: { id: 'a', name: 'Away' },
              status: 'finished',
              kickoffAt: '2026-01-01T00:00:00.000Z',
              provenance: 'synthetic',
              scenarioId: 'rematch-phase4-v1',
            },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      ),
    )

    const service = createApiMatchService('http://localhost:8000')
    const matches = await service.getMatches()
    expect(matches).toHaveLength(1)
    expect(matches[0]?.id).toBe('m-1')
  })
})

describe('DecisionNotFoundError typing', () => {
  it('carries status 404', () => {
    const error = new DecisionNotFoundError(
      'match_not_found',
      'missing',
      'm-x',
    )
    expect(error.status).toBe(404)
    expect(error).toBeInstanceOf(Error)
  })
})
