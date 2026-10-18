import type { MatchEventType } from '../../types'

export const EVENT_TYPE_LABELS: Record<MatchEventType, string> = {
  pass: 'Pass',
  shot: 'Shot',
  carry: 'Carry',
  tackle: 'Tackle',
  pressure: 'Pressure',
  possession_change: 'Possession',
}
