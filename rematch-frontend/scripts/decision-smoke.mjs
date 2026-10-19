#!/usr/bin/env node
/**
 * Optional integration smoke test: frontend service paths against a live backend.
 *
 * Prerequisites:
 *   - Backend running at SMOKE_API_BASE_URL (default http://localhost:8000)
 *   - Seeded rematch-phase4-v1 data (rematch-seed)
 *
 * Usage:
 *   node scripts/decision-smoke.mjs
 *
 * Exit 0 on success, 1 on failure. Not part of `npm run test`.
 */

const base = (process.env.SMOKE_API_BASE_URL ?? 'http://localhost:8000').replace(
  /\/+$/,
  '',
)

const MATCH_ID = 'm-northgate-riverside-2401'
const EVENT_OK = 'evt-ng-carry-64'
const EVENT_422 = 'evt-ng-pressure-41'

async function getJson(path) {
  const response = await fetch(`${base}${path}`)
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  console.log(`Decision smoke → ${base}`)

  const health = await getJson('/api/v1/health')
  assert(health.status === 200, `health expected 200, got ${health.status}`)

  const ok = await getJson(
    `/api/v1/matches/${MATCH_ID}/events/${EVENT_OK}/decision-analysis`,
  )
  assert(ok.status === 200, `carry-64 expected 200, got ${ok.status}`)
  assert(
    ok.body?.scoringMethodId === 'geometric_progression_v1',
    'missing scoringMethodId',
  )
  assert(
    Array.isArray(ok.body?.alternatives) && ok.body.alternatives.length >= 1,
    'expected at least one alternative for carry-64',
  )
  assert(
    ok.body?.observed?.compositeScore != null,
    'expected observed compositeScore',
  )

  const insufficient = await getJson(
    `/api/v1/matches/${MATCH_ID}/events/${EVENT_422}/decision-analysis`,
  )
  assert(
    insufficient.status === 422,
    `pressure expected 422, got ${insufficient.status}`,
  )
  assert(
    insufficient.body?.error?.code === 'insufficient_evidence',
    'expected insufficient_evidence code',
  )

  const missing = await getJson(
    `/api/v1/matches/${MATCH_ID}/events/evt-missing/decision-analysis`,
  )
  assert(missing.status === 404, `missing event expected 404, got ${missing.status}`)

  console.log('Decision smoke: PASS')
  console.log(
    `  observed composite ≈ ${Number(ok.body.observed.compositeScore).toFixed(2)}`,
  )
  console.log(`  alternatives: ${ok.body.alternatives.length}`)
}

main().catch((error) => {
  console.error('Decision smoke: FAIL')
  console.error(error instanceof Error ? error.message : error)
  console.error(
    'Start the backend (uvicorn on :8000, rematch-seed) and retry.',
  )
  process.exit(1)
})
