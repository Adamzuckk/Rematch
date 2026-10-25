import type { Team } from '../types'

/** Compact monogram for kit badges — prefers catalogue shortName. */
export function teamMonogram(team: Team): string {
  if (team.shortName?.trim()) {
    return team.shortName.trim().slice(0, 4).toUpperCase()
  }
  const parts = team.name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }
  return team.name.trim().slice(0, 3).toUpperCase() || 'FC'
}

/** Stable hue offset from team id for kit stripe variation. */
export function teamHue(teamId: string): number {
  let hash = 0
  for (let i = 0; i < teamId.length; i += 1) {
    hash = (hash * 31 + teamId.charCodeAt(i)) >>> 0
  }
  return hash % 40
}
