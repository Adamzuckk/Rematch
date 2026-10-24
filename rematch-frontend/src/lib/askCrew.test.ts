import { describe, expect, it } from 'vitest'
import { SYNTHETIC_EVENTS } from '../mocks/events'
import { SYNTHETIC_PLAYERS } from '../mocks/players'
import { SYNTHETIC_TEAMS } from '../mocks/teams'
import {
  buildAskSuggestions,
  buildLocalFactsAnswer,
  filterAskSuggestions,
  matchSuggestionByTitle,
} from './askCrew'

const passEvent = SYNTHETIC_EVENTS.find((e) => e.type === 'pass')!
const shotGoal =
  SYNTHETIC_EVENTS.find(
    (e) => e.type === 'shot' && e.outcome === 'goal',
  ) ??
  ({
    ...SYNTHETIC_EVENTS.find((e) => e.type === 'shot')!,
    outcome: 'goal' as const,
  } as const)
const tackleEvent = SYNTHETIC_EVENTS.find((e) => e.type === 'tackle')!

describe('askCrew suggestions', () => {
  it('marks narrative and what-if rows available for pass decisions', () => {
    const rows = buildAskSuggestions({ selectedEvent: passEvent })
    const explain = rows.find((r) => r.id === 'explain-decision')!
    const altPass = rows.find((r) => r.id === 'alt-pass')!
    const press = rows.find((r) => r.id === 'press-higher')!
    expect(explain.unavailable).toBe(false)
    expect(explain.action).toBe('narrative')
    expect(altPass.unavailable).toBe(false)
    expect(altPass.action).toBe('whatif')
    expect(press.unavailable).toBe(true)
    expect(press.action).toBe('unsupported')
  })

  it('enables why-goal only for goal shots and keeps before-goal unsupported', () => {
    const rows = buildAskSuggestions({ selectedEvent: shotGoal })
    expect(rows.find((r) => r.id === 'why-goal')!.unavailable).toBe(false)
    expect(rows.find((r) => r.id === 'before-goal')!.unavailable).toBe(true)
    expect(rows.find((r) => r.id === 'before-goal')!.action).toBe('unsupported')
  })

  it('disables decision narrative for non-candidate events', () => {
    const rows = buildAskSuggestions({ selectedEvent: tackleEvent })
    expect(rows.find((r) => r.id === 'explain-decision')!.unavailable).toBe(
      true,
    )
    expect(rows.find((r) => r.id === 'who-involved')!.unavailable).toBe(false)
  })

  it('filters suggestions by capability group', () => {
    const rows = buildAskSuggestions({ selectedEvent: passEvent })
    expect(filterAskSuggestions(rows, 'passing').every((r) => r.filter === 'passing')).toBe(
      true,
    )
    expect(filterAskSuggestions(rows, 'all')).toHaveLength(rows.length)
  })

  it('matches composer text to a suggestion title', () => {
    const rows = buildAskSuggestions({ selectedEvent: passEvent })
    const matched = matchSuggestionByTitle(
      'Which player was involved in this moment?',
      rows,
      (key) =>
        key === 'askCrewSuggestWhoInvolved'
          ? 'Which player was involved in this moment?'
          : key,
    )
    expect(matched?.id).toBe('who-involved')
    expect(
      matchSuggestionByTitle('Who scored the most?', rows, (k) => k),
    ).toBeNull()
  })
})

describe('askCrew local facts', () => {
  it('answers only from event and roster fields without inventing metrics', () => {
    const answer = buildLocalFactsAnswer({
      event: passEvent,
      homeTeam: SYNTHETIC_TEAMS.northgate,
      awayTeam: SYNTHETIC_TEAMS.riverside,
      players: Object.values(SYNTHETIC_PLAYERS),
    })
    expect(answer.kind).toBe('local_facts')
    expect(answer.eventType).toBe('pass')
    expect(answer.playerName).toBeTruthy()
    expect(answer).not.toHaveProperty('distance')
    expect(answer).not.toHaveProperty('speed')
    expect(answer).not.toHaveProperty('possession')
  })
})
