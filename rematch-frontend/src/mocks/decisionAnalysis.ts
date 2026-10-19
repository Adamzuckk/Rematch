/**
 * Synthetic decision-analysis fixtures for mock mode.
 *
 * These are static, pre-authored payloads — not live engine output.
 * The frontend mock catalogue has no frames, so alternatives are empty and
 * completeness is partial. Use API mode against the seeded backend for
 * frame-backed alternatives (e.g. evt-ng-carry-64).
 *
 * Provenance is always `synthetic`. Scores mirror geometric_progression_v1
 * formulas applied offline to the mock event coordinates; they are not
 * recomputed in the UI.
 */
import type { ActionScore, DecisionAnalysis, MetricValue } from '../types'
import { SYNTHETIC_PROVENANCE } from './scenario'

const SCORING_ASSUMPTIONS = [
  'Home team attacks toward x=100; away toward x=0.',
  'Composite = progressive_distance + goal_proximity_gain (pitch-percent units).',
  'Shots are scored as a virtual path from location to opponent goal centre.',
  'Hypothetical passes end at teammate frame positions; no lane clearance model.',
  'Outcome fields (complete/goal/…) are reported as context, not mixed into the score.',
  'MOCK FIXTURE: no aligned frames in rematch-phase2-v1 — alternatives are empty.',
]

function pathMetrics(args: {
  startX: number
  startY: number
  endX: number
  endY: number
  isHome: boolean
  progressive: number
  goalProximityGain: number
  pathLength: number
  startDist: number
  endDist: number
  composite: number
}): MetricValue[] {
  const inputs = {
    start_x: args.startX,
    start_y: args.startY,
    end_x: args.endX,
    end_y: args.endY,
    is_home: args.isHome,
  }
  return [
    {
      name: 'progressive_distance',
      status: 'available',
      value: args.progressive,
      unit: 'pitch_percent',
      formula: 'attack_sign(is_home) * (end.x - start.x)',
      inputs,
    },
    {
      name: 'goal_proximity_gain',
      status: 'available',
      value: args.goalProximityGain,
      unit: 'pitch_percent',
      formula: 'distance_to_goal(start) - distance_to_goal(end)',
      inputs,
    },
    {
      name: 'path_length',
      status: 'available',
      value: args.pathLength,
      unit: 'pitch_percent',
      formula: 'euclidean(start, end)',
      inputs,
    },
    {
      name: 'start_distance_to_goal',
      status: 'available',
      value: args.startDist,
      unit: 'pitch_percent',
      formula: 'euclidean(start, opponent_goal_centre)',
      inputs,
    },
    {
      name: 'end_distance_to_goal',
      status: 'available',
      value: args.endDist,
      unit: 'pitch_percent',
      formula: 'euclidean(end, opponent_goal_centre)',
      inputs,
    },
    {
      name: 'composite_score',
      status: 'available',
      value: args.composite,
      unit: 'pitch_percent',
      formula:
        'progressive_distance(start, end, is_home) + goal_proximity_gain(start, end, is_home)',
      inputs,
    },
  ]
}

function observedAction(
  actionId: string,
  kind: ActionScore['kind'],
  label: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
  metrics: MetricValue[],
  composite: number,
): ActionScore {
  return {
    actionId,
    kind,
    label,
    start,
    end,
    targetPlayerId: null,
    metrics,
    compositeScore: composite,
    rankable: true,
    limitations: [
      'Synthetic mock fixture — not live backend analysis.',
      'No aligned frame in mock catalogue; alternatives unavailable.',
    ],
  }
}

function baseAnalysis(
  partial: Omit<
    DecisionAnalysis,
    | 'scoringMethodId'
    | 'scoringMethodVersion'
    | 'scoringAssumptions'
    | 'alternatives'
    | 'provenance'
    | 'completeness'
    | 'confidence'
  > & {
    observed: ActionScore
  },
): DecisionAnalysis {
  return {
    ...partial,
    scoringMethodId: 'geometric_progression_v1',
    scoringMethodVersion: '1.0.0',
    scoringAssumptions: SCORING_ASSUMPTIONS,
    alternatives: [],
    completeness: {
      level: 'partial',
      hasCoordinates: true,
      hasAlignedFrame: false,
      teammatePositionsInFrame: 0,
      opponentPositionsInFrame: 0,
      alternativeCount: 0,
      missing: ['aligned_frame', 'alternatives'],
      notes: [
        'Mock catalogue (rematch-phase2-v1) ships no frames. Switch to API mode for frame-backed alternatives.',
      ],
    },
    confidence: 'low',
    provenance: SYNTHETIC_PROVENANCE,
  }
}

/** Keyed by `${matchId}::${eventId}` */
export const SYNTHETIC_DECISION_ANALYSES: Record<string, DecisionAnalysis> = {
  'm-northgate-riverside-2401::evt-ng-pass-12': baseAnalysis({
    matchId: 'm-northgate-riverside-2401',
    eventId: 'evt-ng-pass-12',
    eventType: 'pass',
    teamId: 'team-northgate',
    playerId: 'player-northgate-8',
    isHomeTeam: true,
    observed: observedAction(
      'observed:evt-ng-pass-12',
      'observed_pass',
      'Observed pass',
      { x: 42, y: 48 },
      { x: 58, y: 62 },
      pathMetrics({
        startX: 42,
        startY: 48,
        endX: 58,
        endY: 62,
        isHome: true,
        progressive: 16,
        goalProximityGain: 14.371,
        pathLength: 21.260,
        startDist: 58.052,
        endDist: 43.681,
        composite: 30.371,
      }),
      30.371,
    ),
    ranking: [
      {
        rank: 1,
        actionId: 'observed:evt-ng-pass-12',
        kind: 'observed_pass',
        label: 'Observed pass',
        compositeScore: 30.371,
        targetPlayerId: null,
        rankable: true,
      },
    ],
    claims: [
      {
        id: 'claim-observed-scored',
        statement: 'The observed pass has a geometric composite score of 30.371 pitch-percent.',
        status: 'verified',
        evidence: [
          {
            kind: 'event',
            id: 'evt-ng-pass-12',
            matchId: 'm-northgate-riverside-2401',
            detail: 'Observed pass coordinates',
          },
          {
            kind: 'calculation',
            id: 'calc:observed:evt-ng-pass-12:composite_score',
            matchId: 'm-northgate-riverside-2401',
            detail: null,
          },
        ],
        reason: 'Event coordinates and calculation reference present in mock fixture.',
        limitations: ['Synthetic mock fixture.'],
        calculation: { value: 30.371, unit: 'pitch_percent' },
      },
      {
        id: 'claim-alternatives-exhaustive',
        statement: 'All plausible alternatives were evaluated.',
        status: 'unsupported',
        evidence: [],
        reason: 'Mock catalogue has no aligned frames; alternatives cannot be enumerated.',
        limitations: ['No frame data in rematch-phase2-v1.'],
        calculation: null,
      },
      {
        id: 'claim-higher-score-better-decision',
        statement:
          'A higher geometric score means the action was the objectively correct football decision.',
        status: 'unsupported',
        evidence: [],
        reason:
          'geometric_progression_v1 measures pitch geometry only — not decision quality, probability, or outcome.',
        limitations: ['Never treat composite rank as an objective correctness verdict.'],
        calculation: null,
      },
    ],
    limitations: [
      'Synthetic mock fixture — not live backend analysis.',
      'No aligned frames; alternatives empty.',
      'Higher geometric score does not establish a better real-world football decision.',
    ],
    context: {
      playerName: 'Jamie Cole',
      receiverName: 'Leo Park',
      outcome: 'complete',
      minute: 12,
      frameId: null,
      mockFixture: true,
    },
  }),

  'm-northgate-riverside-2401::evt-ng-carry-64': baseAnalysis({
    matchId: 'm-northgate-riverside-2401',
    eventId: 'evt-ng-carry-64',
    eventType: 'carry',
    teamId: 'team-northgate',
    playerId: 'player-northgate-11',
    isHomeTeam: true,
    observed: observedAction(
      'observed:evt-ng-carry-64',
      'observed_carry',
      'Observed carry',
      { x: 35, y: 30 },
      { x: 52, y: 44 },
      pathMetrics({
        startX: 35,
        startY: 30,
        endX: 52,
        endY: 44,
        isHome: true,
        progressive: 17,
        goalProximityGain: 19.634,
        pathLength: 22.023,
        startDist: 68.007,
        endDist: 48.374,
        composite: 36.634,
      }),
      36.634,
    ),
    ranking: [
      {
        rank: 1,
        actionId: 'observed:evt-ng-carry-64',
        kind: 'observed_carry',
        label: 'Observed carry',
        compositeScore: 36.634,
        targetPlayerId: null,
        rankable: true,
      },
    ],
    claims: [
      {
        id: 'claim-observed-scored',
        statement: 'The observed carry has a geometric composite score of 36.634 pitch-percent.',
        status: 'verified',
        evidence: [
          {
            kind: 'event',
            id: 'evt-ng-carry-64',
            matchId: 'm-northgate-riverside-2401',
            detail: 'Observed carry coordinates',
          },
        ],
        reason: 'Event coordinates present in mock fixture.',
        limitations: [
          'Synthetic mock fixture. Backend API mode adds a frame-backed alternative pass.',
        ],
        calculation: { value: 36.634, unit: 'pitch_percent' },
      },
      {
        id: 'claim-partial-frame',
        statement: 'An aligned frame supports alternative comparison for this carry.',
        status: 'partially_supported',
        evidence: [
          {
            kind: 'event',
            id: 'evt-ng-carry-64',
            matchId: 'm-northgate-riverside-2401',
            detail: null,
          },
        ],
        reason:
          'Event exists, but the mock catalogue has no frames. API mode seeds frm-ng-64.',
        limitations: ['Use VITE_MATCH_DATA_SOURCE=api for complete analysis.'],
        calculation: null,
      },
      {
        id: 'claim-higher-score-better-decision',
        statement:
          'A higher geometric score means the action was the objectively correct football decision.',
        status: 'unsupported',
        evidence: [],
        reason:
          'geometric_progression_v1 measures pitch geometry only — not decision quality.',
        limitations: [],
        calculation: null,
      },
    ],
    limitations: [
      'Synthetic mock fixture — not live backend analysis.',
      'No aligned frames in mock; alternatives empty. Backend seed includes frm-ng-64 with one alternative.',
      'Higher geometric score does not establish a better real-world football decision.',
    ],
    context: {
      playerName: 'Leo Park',
      receiverName: null,
      outcome: null,
      minute: 64,
      frameId: null,
      mockFixture: true,
    },
  }),

  'm-northgate-riverside-2401::evt-ng-shot-23': baseAnalysis({
    matchId: 'm-northgate-riverside-2401',
    eventId: 'evt-ng-shot-23',
    eventType: 'shot',
    teamId: 'team-northgate',
    playerId: 'player-northgate-9',
    isHomeTeam: true,
    observed: observedAction(
      'observed:evt-ng-shot-23',
      'observed_shot',
      'Observed shot',
      { x: 88, y: 52 },
      { x: 100, y: 50 },
      pathMetrics({
        startX: 88,
        startY: 52,
        endX: 100,
        endY: 50,
        isHome: true,
        progressive: 12,
        goalProximityGain: 12.166,
        pathLength: 12.166,
        startDist: 12.166,
        endDist: 0,
        composite: 24.166,
      }),
      24.166,
    ),
    ranking: [
      {
        rank: 1,
        actionId: 'observed:evt-ng-shot-23',
        kind: 'observed_shot',
        label: 'Observed shot',
        compositeScore: 24.166,
        targetPlayerId: null,
        rankable: true,
      },
    ],
    claims: [
      {
        id: 'claim-shot-not-xg',
        statement: 'The shot composite score is an expected-goals (xG) value.',
        status: 'unsupported',
        evidence: [],
        reason: 'Shots use a virtual path to the goal centre; this is not an xG model.',
        limitations: ['xG is not implemented.'],
        calculation: null,
      },
      {
        id: 'claim-observed-scored',
        statement: 'The observed shot has a geometric composite score.',
        status: 'verified',
        evidence: [
          {
            kind: 'event',
            id: 'evt-ng-shot-23',
            matchId: 'm-northgate-riverside-2401',
            detail: 'Shot location used as path start',
          },
        ],
        reason: 'Shot location present in mock fixture.',
        limitations: ['Synthetic mock fixture.'],
        calculation: null,
      },
      {
        id: 'claim-alternatives',
        statement: 'Frame-backed pass alternatives were ranked against the shot.',
        status: 'unsupported',
        evidence: [],
        reason: 'No frames in mock catalogue.',
        limitations: [],
        calculation: null,
      },
    ],
    limitations: [
      'Synthetic mock fixture — not live backend analysis.',
      'Shot scoring is a virtual geometric path, not xG.',
      'No aligned frames; alternatives empty.',
    ],
    context: {
      playerName: 'Omar Hale',
      receiverName: null,
      outcome: 'goal',
      minute: 23,
      frameId: null,
      mockFixture: true,
    },
  }),
}

export function decisionFixtureKey(matchId: string, eventId: string): string {
  return `${matchId}::${eventId}`
}

/** Event types that the backend treats as decision candidates. */
export const DECISION_CANDIDATE_TYPES = new Set(['pass', 'shot', 'carry'])
