const DEFAULT_ORCHESTRATOR_URL =
  'https://rematch-dxd6gbbsfufwh3ce.westus3-01.azurewebsites.net/api/orchestrate'
const ORCHESTRATOR_TIMEOUT_MS = 75_000

export type OrchestratorRequest = {
  message: string
  matchId?: string
  eventId?: string
}

export class OrchestratorClientError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'OrchestratorClientError'
    this.status = status
  }
}

type JsonObject = Record<string, unknown>

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function outputTextFrom(value: unknown): string[] {
  if (!isRecord(value) || value.type !== 'message' || !Array.isArray(value.content)) {
    return []
  }
  return value.content.flatMap((item) =>
    isRecord(item) && item.type === 'output_text' && typeof item.text === 'string'
      ? [item.text]
      : [],
  )
}

/** Extract plain assistant text from a Responses payload or the Function's slim reply body. */
export function extractOrchestratorReply(payload: unknown): string {
  if (!isRecord(payload)) return ''

  const response = isRecord(payload.response) ? payload.response : payload
  const output = Array.isArray(response.output) ? response.output : []
  const outputText = output.flatMap(outputTextFrom).join('\n').trim()
  if (outputText) return outputText

  for (const key of ['reply', 'message', 'content'] as const) {
    if (typeof payload[key] === 'string' && payload[key].trim()) {
      return payload[key].trim()
    }
  }
  return ''
}

export function isRetryableOrchestratorError(error: unknown): boolean {
  if (!(error instanceof OrchestratorClientError)) return true
  return error.status == null || error.status >= 500
}

export async function askOrchestrator(
  request: OrchestratorRequest,
): Promise<string> {
  const baseUrl = import.meta.env.VITE_ORCHESTRATOR_URL?.trim()
  const url = baseUrl || DEFAULT_ORCHESTRATOR_URL
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ORCHESTRATOR_TIMEOUT_MS)

  try {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: request.message,
          ...(request.matchId ? { matchId: request.matchId } : {}),
          ...(request.eventId ? { eventId: request.eventId } : {}),
        }),
        signal: controller.signal,
      })
    } catch {
      throw new OrchestratorClientError(
        controller.signal.aborted ? 'Orchestrator request timed out' : 'Unable to reach orchestrator',
      )
    }

    if (!response.ok) {
      throw new OrchestratorClientError(
        `Orchestrator request failed (${response.status})`,
        response.status,
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new OrchestratorClientError('Orchestrator returned an invalid response', response.status)
    }

    const reply = extractOrchestratorReply(payload)
    if (!reply) {
      throw new OrchestratorClientError('Orchestrator returned no reply text', response.status)
    }
    return reply
  } finally {
    clearTimeout(timeoutId)
  }
}
