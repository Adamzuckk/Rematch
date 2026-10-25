import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiMatchService } from './apiMatchService'
import {
  AskUnavailableError,
  DecisionInsufficientEvidenceError,
  DecisionNarrativeUnavailableError,
  DecisionNotFoundError,
  EventIntelligenceUnavailableError,
  MatchApiError,
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
  it('uses same-origin API paths when no base URL is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await createApiMatchService(undefined).getMatches()

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/matches', { headers: {} })
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

  it('GETs event intelligence without fabricating briefing content', async () => {
    const briefing = {
      matchId: 'm-1',
      eventId: 'evt-1',
      eventType: 'pass',
      provenance: 'synthetic',
      analysisMethod: 'deterministic_event_intelligence_v1',
      llmConnected: false,
      decisionCandidate: true,
      english: {
        headline: 'What happened',
        keyObservations: [],
        limitations: [],
        whatHappened: ['A pass was recorded.'],
        whyItMattered: [],
        whatCouldHaveHappened: [],
      },
      arabic: {
        headline: 'ماذا حدث',
        keyObservations: [],
        limitations: [],
        whatHappened: ['سُجّلت تمريرة.'],
        whyItMattered: [],
        whatCouldHaveHappened: [],
      },
      statements: [
        { tier: 'fact', english: 'A pass was recorded.', arabic: 'سُجّلت تمريرة.' },
      ],
      missingEvidence: [],
      limitations: ['No external AI provider is connected.'],
      decisionAnalysis: null,
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(briefing))
    vi.stubGlobal('fetch', fetchMock)

    const service = createApiMatchService('http://localhost:8000')
    const result = await service.getEventIntelligence('m-1', 'evt-1')

    expect(result).toEqual(briefing)
    expect(result.llmConnected).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/matches/m-1/events/evt-1/event-intelligence',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
  })

  it('marks mock-unavailable event intelligence explicitly for 422 responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: 'insufficient_evidence', message: 'No briefing' } },
          422,
        ),
      ),
    )

    const service = createApiMatchService('http://localhost:8000')
    await expect(
      service.getEventIntelligence('m-1', 'evt-1'),
    ).rejects.toBeInstanceOf(EventIntelligenceUnavailableError)
  })

  it('POSTs grounded ask questions with selected event context', async () => {
    const askBody = {
      matchId: 'm-1',
      eventId: 'evt-1',
      status: 'answered',
      intent: 'greeting',
      provenance: 'synthetic',
      answer: {
        english: {
          headline: 'Ask the crew',
          keyObservations: ['Capabilities'],
          limitations: [],
        },
        arabic: {
          headline: 'اسأل الطاقم',
          keyObservations: [],
          limitations: [],
        },
      },
      evidence: [],
      relatedEventIds: ['evt-1'],
      factClasses: ['capability'],
      reason: 'Capability explanation',
      verificationResults: [],
      clientRequestId: 'req-1',
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(askBody))
    vi.stubGlobal('fetch', fetchMock)

    const service = createApiMatchService('http://localhost:8000')
    const result = await service.askMatch('m-1', {
      question: 'hi',
      eventId: 'evt-1',
      language: 'en',
      clientRequestId: 'req-1',
    })

    expect(result).toEqual(askBody)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/matches/m-1/ask',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          question: 'hi',
          language: 'en',
          eventId: 'evt-1',
          clientRequestId: 'req-1',
        }),
      }),
    )
  })

  it('maps ask match-not-found to AskUnavailableError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: 'match_not_found', message: 'Missing match' } },
          404,
        ),
      ),
    )
    const service = createApiMatchService('http://localhost:8000')
    await expect(
      service.askMatch('missing', { question: 'hi' }),
    ).rejects.toBeInstanceOf(AskUnavailableError)
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

  it('GETs match intelligence through the shared API service', async () => {
    const intelligence = {
      matchId: 'm-1',
      provenance: 'synthetic',
      source: 'seeded_events_only',
      eventCounts: { pass: 2 },
      totalEvents: 2,
      eventsWithCoordinates: 2,
      alignedFrames: 1,
      pathMetricsPresent: 1,
      avgBallSpeedMps: 12.4,
      avgShotSpeedMps: null,
      avgPassDistanceM: 16.2,
      keyMoments: [],
      limitations: ['Synthetic data only.'],
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(intelligence))
    vi.stubGlobal('fetch', fetchMock)

    const service = createApiMatchService('http://localhost:8000/')
    await expect(service.getMatchIntelligence('m-1')).resolves.toEqual(intelligence)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/matches/m-1/intelligence',
      { headers: {} },
    )
  })

  it('maps a missing intelligence match without falling back to mock data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: 'match_not_found', message: 'Match not found: m-x' } },
          404,
        ),
      ),
    )

    const service = createApiMatchService('http://localhost:8000')
    await expect(service.getMatchIntelligence('m-x')).rejects.toMatchObject({
      name: 'MatchNotFoundError',
      matchId: 'm-x',
    })
  })

  it('keeps non-not-found intelligence API failures explicit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: 'internal_error', message: 'Intelligence unavailable' } },
          500,
        ),
      ),
    )

    const service = createApiMatchService('http://localhost:8000')
    await expect(service.getMatchIntelligence('m-1')).rejects.toMatchObject({
      name: 'MatchApiError',
      status: 500,
      code: 'internal_error',
      message: 'Intelligence unavailable',
    })
  })

  it('GETs filtered stored system telemetry without substituting mock values', async () => {
    const metrics = {
      generatedAt: '2026-10-22T10:00:00Z',
      range: '7d', operation: 'analysis', source: 'Stored ReMatch operational telemetry.',
      operations: { attempts: 2, succeeded: 1, failed: 1, successRatePercent: 50, averageLatencyMs: 8, p95LatencyMs: 12 },
      verification: { checked: 3, verified: 2, partiallySupported: 1, unsupported: 0 },
      fallbackUsage: { available: false, count: null, reason: 'No fallback path.' },
      catalogueCoverage: { source: 'Current catalogue (synthetic data)', provenance: 'synthetic', totalEvents: 10, eligibleEvents: 6, coveragePercent: 60, description: 'Eligibility only.' },
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(metrics))
    vi.stubGlobal('fetch', fetchMock)

    const service = createApiMatchService('http://localhost:8000')
    await expect(service.getSystemMetrics({ range: '7d', operation: 'analysis' })).resolves.toEqual(metrics)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/system-metrics?range=7d&operation=analysis',
      { headers: {} },
    )
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
