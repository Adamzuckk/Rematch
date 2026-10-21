import type { MatchEventType } from '../../types'

export const EVENT_TYPE_LABELS: Record<MatchEventType, string> = {
  pass: 'Pass',
  shot: 'Shot',
  carry: 'Carry',
  tackle: 'Tackle',
  pressure: 'Pressure',
  possession_change: 'Possession',
}

const EVENT_TYPE_LABELS_AR: Record<MatchEventType, string> = {
  pass: 'تمريرة',
  shot: 'تسديدة',
  carry: 'حمل الكرة',
  tackle: 'افتكاك',
  pressure: 'ضغط',
  possession_change: 'استحواذ',
}

export function eventTypeLabel(type: MatchEventType, locale: string): string {
  return locale === 'ar' ? EVENT_TYPE_LABELS_AR[type] : EVENT_TYPE_LABELS[type]
}
