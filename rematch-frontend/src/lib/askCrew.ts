import type { MessageKey } from '../i18n/strings'
import type { MatchEvent, Player, Team } from '../types'
import { isDecisionCandidate } from './pitch'

/** Quick filters for suggested ASK questions. */
export type AskSuggestionFilter =
  | 'all'
  | 'goals'
  | 'decisions'
  | 'passing'
  | 'tactics'

/**
 * How a suggestion is fulfilled.
 * - `narrative` — GET …/decision-analysis/narrative for the selected event
 * - `whatif` — open Decision Explorer for alternatives
 * - `local_facts` — answer only from selected event / roster fields (no API)
 * - `unsupported` — capability missing; never invent an answer
 */
export type AskSuggestionAction =
  | 'narrative'
  | 'whatif'
  | 'local_facts'
  | 'unsupported'

export interface AskSuggestion {
  id: string
  filter: Exclude<AskSuggestionFilter, 'all'>
  action: AskSuggestionAction
  titleKey: MessageKey
  capabilityKey: MessageKey
  /** When true, row is disabled and shows unavailable copy. */
  unavailable: boolean
  unavailableReasonKey?: MessageKey
}

export interface AskLocalFactsAnswer {
  kind: 'local_facts'
  minuteLabel: string | null
  eventType: MatchEvent['type']
  teamName: string | null
  playerName: string | null
  receiverName: string | null
  shotOutcome: string | null
  passOutcome: string | null
  provenance: MatchEvent['provenance']
  missing: string[]
}

function resolveTeamName(
  teamId: string | undefined,
  homeTeam: Team,
  awayTeam: Team,
): string | null {
  if (!teamId) return null
  if (teamId === homeTeam.id) return homeTeam.name
  if (teamId === awayTeam.id) return awayTeam.name
  return null
}

function resolvePlayerName(
  playerId: string | undefined,
  players: readonly Player[],
): string | null {
  if (!playerId) return null
  return players.find((player) => player.id === playerId)?.name ?? null
}

function formatMinute(minute: number | undefined): string | null {
  if (minute == null || !Number.isFinite(minute)) return null
  return `${Math.floor(minute)}'`
}

/**
 * Build contextual suggested questions from real capabilities and selected event.
 * Unavailable rows stay visible and marked — never silently answered.
 */
export function buildAskSuggestions(input: {
  selectedEvent: MatchEvent | null
}): AskSuggestion[] {
  const event = input.selectedEvent
  const decision = event != null && isDecisionCandidate(event)
  const isShot = event?.type === 'shot'
  const isGoal = isShot && event.outcome === 'goal'
  const isPass = event?.type === 'pass'
  const hasEvent = event != null

  const rows: AskSuggestion[] = [
    {
      id: 'explain-decision',
      filter: 'decisions',
      action: 'narrative',
      titleKey: 'askCrewSuggestExplainDecision',
      capabilityKey: 'askCrewCapNarrative',
      unavailable: !decision,
      unavailableReasonKey: hasEvent
        ? 'askCrewUnavailableNotDecision'
        : 'askCrewUnavailableNoEvent',
    },
    {
      id: 'evidence-checks',
      filter: 'decisions',
      action: 'narrative',
      titleKey: 'askCrewSuggestEvidence',
      capabilityKey: 'askCrewCapNarrative',
      unavailable: !decision,
      unavailableReasonKey: hasEvent
        ? 'askCrewUnavailableNotDecision'
        : 'askCrewUnavailableNoEvent',
    },
    {
      id: 'who-involved',
      filter: 'decisions',
      action: 'local_facts',
      titleKey: 'askCrewSuggestWhoInvolved',
      capabilityKey: 'askCrewCapLocalFacts',
      unavailable: !hasEvent,
      unavailableReasonKey: 'askCrewUnavailableNoEvent',
    },
    {
      id: 'why-goal',
      filter: 'goals',
      action: 'narrative',
      titleKey: 'askCrewSuggestWhyGoal',
      capabilityKey: 'askCrewCapNarrative',
      unavailable: !isGoal,
      unavailableReasonKey: hasEvent
        ? 'askCrewUnavailableNotGoal'
        : 'askCrewUnavailableNoEvent',
    },
    {
      id: 'before-goal',
      filter: 'goals',
      action: 'unsupported',
      titleKey: 'askCrewSuggestBeforeGoal',
      capabilityKey: 'askCrewCapNeedsAskApi',
      unavailable: true,
      unavailableReasonKey: 'askCrewUnavailableNeedsAskApi',
    },
    {
      id: 'alt-pass',
      filter: 'passing',
      action: 'whatif',
      titleKey: 'askCrewSuggestAltPass',
      capabilityKey: 'askCrewCapWhatIf',
      unavailable: !(decision && isPass),
      unavailableReasonKey: hasEvent
        ? 'askCrewUnavailableNotPassDecision'
        : 'askCrewUnavailableNoEvent',
    },
    {
      id: 'compare-alt',
      filter: 'passing',
      action: 'whatif',
      titleKey: 'askCrewSuggestCompareAlt',
      capabilityKey: 'askCrewCapWhatIf',
      unavailable: !decision,
      unavailableReasonKey: hasEvent
        ? 'askCrewUnavailableNotDecision'
        : 'askCrewUnavailableNoEvent',
    },
    {
      id: 'press-higher',
      filter: 'tactics',
      action: 'unsupported',
      titleKey: 'askCrewSuggestPressHigher',
      capabilityKey: 'askCrewCapNeedsAskApi',
      unavailable: true,
      unavailableReasonKey: 'askCrewUnavailableNeedsAskApi',
    },
    {
      id: 'match-summary',
      filter: 'tactics',
      action: 'unsupported',
      titleKey: 'askCrewSuggestMatchSummary',
      capabilityKey: 'askCrewCapNeedsAskApi',
      unavailable: true,
      unavailableReasonKey: 'askCrewUnavailableNeedsAskApi',
    },
  ]

  return rows
}

export function filterAskSuggestions(
  suggestions: readonly AskSuggestion[],
  filter: AskSuggestionFilter,
): AskSuggestion[] {
  if (filter === 'all') return [...suggestions]
  return suggestions.filter((item) => item.filter === filter)
}

/** Grounded local answer from selected event fields only — no invented stats. */
export function buildLocalFactsAnswer(input: {
  event: MatchEvent
  homeTeam: Team
  awayTeam: Team
  players: readonly Player[]
}): AskLocalFactsAnswer {
  const { event, homeTeam, awayTeam, players } = input
  const missing: string[] = []
  const teamName = resolveTeamName(event.teamId, homeTeam, awayTeam)
  const playerName = resolvePlayerName(event.playerId, players)
  if (!event.teamId || !teamName) missing.push('team')
  if (!event.playerId || !playerName) missing.push('player')

  let receiverName: string | null = null
  let shotOutcome: string | null = null
  let passOutcome: string | null = null

  if (event.type === 'pass') {
    receiverName = resolvePlayerName(event.receiverId, players)
    passOutcome = event.outcome ?? null
    if (!event.receiverId || !receiverName) missing.push('receiver')
    if (!event.outcome) missing.push('passOutcome')
  }
  if (event.type === 'shot') {
    shotOutcome = event.outcome ?? null
    if (!event.outcome) missing.push('shotOutcome')
  }

  return {
    kind: 'local_facts',
    minuteLabel: formatMinute(event.minute),
    eventType: event.type,
    teamName,
    playerName,
    receiverName,
    shotOutcome,
    passOutcome,
    provenance: event.provenance,
    missing,
  }
}

/**
 * Map free-form composer text to a known suggestion when the user pastes or
 * types a suggested title (case-insensitive). Otherwise null → unsupported.
 */
export function matchSuggestionByTitle(
  draft: string,
  suggestions: readonly AskSuggestion[],
  resolveTitle: (key: MessageKey) => string,
): AskSuggestion | null {
  const normalized = draft.trim().toLowerCase()
  if (!normalized) return null
  return (
    suggestions.find(
      (item) => resolveTitle(item.titleKey).trim().toLowerCase() === normalized,
    ) ?? null
  )
}
