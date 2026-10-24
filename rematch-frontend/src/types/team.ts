export interface Team {
  id: string
  name: string
  /** Short label for compact UI; optional when not supplied by the dataset */
  shortName?: string
  /** Named coach when the catalogue supplies one */
  coachName?: string
}
