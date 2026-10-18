export interface Player {
  id: string
  name: string
  teamId: string
  /** Shirt number when the scenario provides one */
  shirtNumber?: number
}
