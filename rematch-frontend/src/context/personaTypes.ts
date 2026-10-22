export type ViewMode = 'fan' | 'analyst'

export type PersonaPrefs = {
  mode: ViewMode
  favoriteTeamId: string | null
  favoritePlayerId: string | null
  playerFocusId: string | null
}
