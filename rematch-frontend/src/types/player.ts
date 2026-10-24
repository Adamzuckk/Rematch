export interface Player {
  id: string
  name: string
  teamId: string
  /** Shirt number when the scenario provides one */
  shirtNumber?: number
  /** Positional role (GK/DF/MF/FW) when supplied */
  role?: string
  /** Formation slot label when supplied */
  positionSlot?: string
}
