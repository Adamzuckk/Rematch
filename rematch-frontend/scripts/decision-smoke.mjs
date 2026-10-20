#!/usr/bin/env node
/**
 * Live integration smoke test for the Phase 8 API-backed match journey.
 *
 * Prerequisites:
 *   - Backend running at SMOKE_API_BASE_URL (default http://127.0.0.1:8000)
 *   - Database migrated and seeded with rematch-seed (Phase 4 + Phase 8)
 *
 * Usage:
 *   npm run smoke:decision
 *
 * Exit 0 on success, 1 on failure. Not part of `npm run test`.
 */

const base = (process.env.SMOKE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(
  /\/+$/,
  '',
)

const PHASE8_SCENARIO_ID = 'rematch-phase8-v1'
const ELIGIBLE_TYPES = new Set(['pass', 'shot', 'carry'])

async function getJson(path) {
  const response = await fetch(`${base}${path}`)
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  console.log(`Phase 9 API journey smoke → ${base}`)

  const health = await getJson('/api/v1/health')
  assert(health.status === 200, `health expected 200, got ${health.status}`)

  const dataset = await getJson('/api/v1/matches/dataset')
  assert(dataset.status === 200, `dataset expected 200, got ${dataset.status}`)
  assert(
    dataset.body?.scenarioId === PHASE8_SCENARIO_ID,
    `expected ${PHASE8_SCENARIO_ID} as the active dataset, got ${dataset.body?.scenarioId ?? 'none'}; run rematch-seed`,
  )

  const catalogue = await getJson('/api/v1/matches')
  assert(catalogue.status === 200, `matches expected 200, got ${catalogue.status}`)
  const match = catalogue.body?.items?.find(
    (row) => row.scenarioId === PHASE8_SCENARIO_ID,
  )
  assert(match, `no ${PHASE8_SCENARIO_ID} match found in catalogue`)

  const detail = await getJson(`/api/v1/matches/${encodeURIComponent(match.id)}`)
  assert(detail.status === 200, `match detail expected 200, got ${detail.status}`)
  assert(detail.body?.id === match.id, 'match detail did not match selected match')

  const [events, frames, players] = await Promise.all([
    getJson(`/api/v1/matches/${encodeURIComponent(match.id)}/events`),
    getJson(`/api/v1/matches/${encodeURIComponent(match.id)}/frames`),
    getJson(`/api/v1/matches/${encodeURIComponent(match.id)}/players`),
  ])
  assert(events.status === 200, `events expected 200, got ${events.status}`)
  assert(frames.status === 200, `frames expected 200, got ${frames.status}`)
  assert(players.status === 200, `players expected 200, got ${players.status}`)
  assert(events.body?.items?.length > 0, 'selected match has no events')
  assert(players.body?.length === 22, 'selected match does not expose its 22 players')

  const eventById = new Map(events.body.items.map((event) => [event.id, event]))
  const frame = frames.body?.items?.find((candidate) => {
    const event = eventById.get(candidate.eventId)
    return event && ELIGIBLE_TYPES.has(event.type)
  })
  assert(frame, 'no aligned pass/shot/carry event and frame is available')
  assert(frame.players.length === 22, 'selected Phase 8 frame is not a full-XI snapshot')

  const event = eventById.get(frame.eventId)
  const response = await getJson(
    `/api/v1/matches/${encodeURIComponent(match.id)}/events/${encodeURIComponent(frame.eventId)}/decision-analysis`,
  )
  assert(response.status === 200, `decision analysis expected 200, got ${response.status}`)
  const analysis = response.body
  assert(analysis?.eventId === event.id, 'analysis event did not match selected event')
  assert(analysis?.provenance === 'synthetic', 'analysis provenance is not synthetic')
  assert(
    analysis?.scoringMethodId === 'geometric_progression_v1',
    'unexpected decision scoring method',
  )
  assert(analysis?.observed?.compositeScore != null, 'observed score is unavailable')
  assert(analysis?.alternatives?.length > 0, 'no frame-backed alternatives returned')
  assert(
    ![
      ...analysis.limitations,
      ...analysis.claims.flatMap((claim) => claim.limitations),
    ].some((item) => item.toLowerCase().includes('sparse frame')),
    'full-XI Phase 8 analysis incorrectly reports sparse-frame limitations',
  )

  const positionsByPlayer = new Map(frame.players.map((row) => [row.playerId, row]))
  const playerIds = new Set(players.body.map((row) => row.id))
  for (const alternative of analysis.alternatives) {
    const targetId = alternative.targetPlayerId
    const position = positionsByPlayer.get(targetId)
    assert(alternative.kind === 'hypothetical_pass', 'alternative is not a hypothetical pass')
    assert(playerIds.has(targetId), `target ${targetId} is absent from the match player list`)
    assert(position, `target ${targetId} is absent from the aligned frame`)
    assert(
      JSON.stringify(alternative.end) === JSON.stringify(position.position),
      `alternative ${alternative.actionId} endpoint does not match frame data`,
    )
    assert(alternative.compositeScore != null, `alternative ${alternative.actionId} has no backend score`)
    assert(
      analysis.ranking.some(
        (rank) => rank.actionId === alternative.actionId && rank.compositeScore === alternative.compositeScore,
      ),
      `alternative ${alternative.actionId} is missing its backend rank entry`,
    )
  }

  const missingMatch = await getJson('/api/v1/matches/phase9-smoke-missing-match')
  assert(missingMatch.status === 404, `missing match expected 404, got ${missingMatch.status}`)

  const pressureEvent = events.body.items.find((row) => row.type === 'pressure')
  assert(pressureEvent, 'seeded match lacks the unsupported pressure edge case')
  const insufficient = await getJson(
    `/api/v1/matches/${encodeURIComponent(match.id)}/events/${encodeURIComponent(pressureEvent.id)}/decision-analysis`,
  )
  assert(insufficient.status === 422, `pressure event expected 422, got ${insufficient.status}`)
  assert(
    insufficient.body?.error?.code === 'insufficient_evidence',
    'pressure event did not return insufficient_evidence',
  )

  const missingEvent = await getJson(
    `/api/v1/matches/${encodeURIComponent(match.id)}/events/phase9-smoke-missing-event/decision-analysis`,
  )
  assert(missingEvent.status === 404, `missing event expected 404, got ${missingEvent.status}`)

  console.log('Phase 9 API journey smoke: PASS')
  console.log(`  dataset: ${dataset.body.scenarioId} (${dataset.body.matchCount} matches)`)
  console.log(`  selected match: ${match.id}; events=${events.body.total}; frames=${frames.body.total}`)
  console.log(`  aligned ${event.type} ${event.id}; alternatives=${analysis.alternatives.length}`)
  console.log(`  observed backend score=${Number(analysis.observed.compositeScore).toFixed(2)}`)
  console.log('  missing match/event: 404; unsupported event: 422 insufficient_evidence')
}

main().catch((error) => {
  console.error('Phase 9 API journey smoke: FAIL')
  console.error(error instanceof Error ? error.message : error)
  console.error('Start the backend, migrate the database, and run rematch-seed.')
  process.exit(1)
})
