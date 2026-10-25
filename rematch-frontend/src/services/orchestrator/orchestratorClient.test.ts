import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  askOrchestrator,
  extractOrchestratorReply,
  OrchestratorClientError,
} from './orchestratorClient'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('extractOrchestratorReply', () => {
  it('joins output_text items from Responses message outputs', () => {
    expect(extractOrchestratorReply({
      response: {
        output: [
          { type: 'reasoning', content: [] },
          { type: 'message', content: [
            { type: 'output_text', text: 'Grounded reply.' },
            { type: 'refusal', refusal: 'ignored' },
            { type: 'output_text', text: 'Second paragraph.' },
          ] },
        ],
      },
    })).toBe('Grounded reply.\nSecond paragraph.')
  })

  it.each([
    [{ reply: 'Function reply.' }, 'Function reply.'],
    [{ message: 'Message fallback.' }, 'Message fallback.'],
    [{ content: 'Content fallback.' }, 'Content fallback.'],
  ])('supports the %j string fallback', (payload, expected) => {
    expect(extractOrchestratorReply(payload)).toBe(expected)
  })
})

describe('askOrchestrator', () => {
  it('posts the question and current decision identifiers, then returns plain reply text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ reply: 'Orchestrator answer.' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_ORCHESTRATOR_URL', 'https://function.example/api/orchestrate')

    await expect(askOrchestrator({
      message: 'Confirm you are the orchestrator',
      matchId: 'match-1',
      eventId: 'event-4',
    })).resolves.toBe('Orchestrator answer.')

    expect(fetchMock).toHaveBeenCalledWith('https://function.example/api/orchestrate', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Confirm you are the orchestrator', matchId: 'match-1', eventId: 'event-4' }),
      signal: expect.any(AbortSignal),
    }))
  })

  it('throws an error containing the HTTP status without exposing response details', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('secret-looking response body', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(askOrchestrator({ message: 'hello' })).rejects.toMatchObject({
      name: 'OrchestratorClientError',
      status: 503,
      message: 'Orchestrator request failed (503)',
    } satisfies Partial<OrchestratorClientError>)
  })
})
