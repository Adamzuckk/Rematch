import type { MatchSummary, Team } from '../types'

export type FormResult = 'W' | 'D' | 'L'

export interface TeamStanding {
  team: Team
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  /** Oldest → newest among the last five completed matches */
  form: FormResult[]
}

export interface StandingMatchResult {
  matchId: string
  kickoffAt: string
  competition: string
  teamId: string
  opponentName: string
  isHome: boolean
  goalsFor: number
  goalsAgainst: number
  result: FormResult
}

function isCompletedWithScore(match: MatchSummary): boolean {
  return (
    match.status === 'finished' &&
    match.score != null &&
    Number.isFinite(match.score.home) &&
    Number.isFinite(match.score.away)
  )
}

function resultForSide(goalsFor: number, goalsAgainst: number): FormResult {
  if (goalsFor > goalsAgainst) return 'W'
  if (goalsFor < goalsAgainst) return 'L'
  return 'D'
}

/**
 * Extract one result row per participating team from completed fixtures only.
 * Upcoming, live, postponed-style, and unscored matches are excluded.
 */
export function extractCompletedResults(
  matches: readonly MatchSummary[],
): StandingMatchResult[] {
  const rows: StandingMatchResult[] = []

  for (const match of matches) {
    if (!isCompletedWithScore(match) || !match.score) continue

    const { home, away } = match.score
    rows.push({
      matchId: match.id,
      kickoffAt: match.kickoffAt,
      competition: match.competition,
      teamId: match.homeTeam.id,
      opponentName: match.awayTeam.name,
      isHome: true,
      goalsFor: home,
      goalsAgainst: away,
      result: resultForSide(home, away),
    })
    rows.push({
      matchId: match.id,
      kickoffAt: match.kickoffAt,
      competition: match.competition,
      teamId: match.awayTeam.id,
      opponentName: match.homeTeam.name,
      isHome: false,
      goalsFor: away,
      goalsAgainst: home,
      result: resultForSide(away, home),
    })
  }

  return rows
}

function compareStandings(a: TeamStanding, b: TeamStanding): number {
  if (b.points !== a.points) return b.points - a.points
  if (b.goalDifference !== a.goalDifference) {
    return b.goalDifference - a.goalDifference
  }
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
  return a.team.name.localeCompare(b.team.name)
}

/**
 * Build league standings from completed match results.
 * Tie-breakers: points → goal difference → goals scored → team name.
 */
export function buildStandings(
  matches: readonly MatchSummary[],
  options?: { competition?: string | null },
): TeamStanding[] {
  const competition = options?.competition?.trim() || null
  const scoped = competition
    ? matches.filter((match) => match.competition === competition)
    : matches

  const teamById = new Map<string, Team>()
  for (const match of scoped) {
    teamById.set(match.homeTeam.id, match.homeTeam)
    teamById.set(match.awayTeam.id, match.awayTeam)
  }

  const results = extractCompletedResults(scoped)
  const byTeam = new Map<
    string,
    {
      played: number
      won: number
      drawn: number
      lost: number
      goalsFor: number
      goalsAgainst: number
      formSource: StandingMatchResult[]
    }
  >()

  for (const row of results) {
    const existing = byTeam.get(row.teamId) ?? {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      formSource: [],
    }
    existing.played += 1
    existing.goalsFor += row.goalsFor
    existing.goalsAgainst += row.goalsAgainst
    if (row.result === 'W') existing.won += 1
    else if (row.result === 'D') existing.drawn += 1
    else existing.lost += 1
    existing.formSource.push(row)
    byTeam.set(row.teamId, existing)
  }

  const standings: TeamStanding[] = []
  for (const [teamId, stats] of byTeam) {
    const team = teamById.get(teamId)
    if (!team) continue

    const ordered = stats.formSource
      .slice()
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))
    const lastFive = ordered.slice(-5)

    standings.push({
      team,
      played: stats.played,
      won: stats.won,
      drawn: stats.drawn,
      lost: stats.lost,
      goalsFor: stats.goalsFor,
      goalsAgainst: stats.goalsAgainst,
      goalDifference: stats.goalsFor - stats.goalsAgainst,
      points: stats.won * 3 + stats.drawn,
      form: lastFive.map((row) => row.result),
    })
  }

  return standings.sort(compareStandings)
}

/** Competitions that have at least one completed scored fixture. */
export function competitionsWithCompletedMatches(
  matches: readonly MatchSummary[],
): string[] {
  const set = new Set<string>()
  for (const match of matches) {
    if (isCompletedWithScore(match)) {
      set.add(match.competition)
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}
