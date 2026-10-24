import type { MatchEventType } from '../../types'

export const EVENT_TYPE_LABELS: Record<MatchEventType, string> = {
  pass: 'Pass',
  shot: 'Shot',
  carry: 'Carry',
  tackle: 'Tackle',
  pressure: 'Pressure',
  possession_change: 'Possession',
  foul: 'Foul',
  yellow_card: 'Yellow card',
  red_card: 'Red card',
  substitution: 'Substitution',
  offside: 'Offside',
  counterattack: 'Counterattack',
  reverse_attack: 'Reverse attack',
  counter_press: 'Counter-press',
}

const EVENT_TYPE_LABELS_AR: Record<MatchEventType, string> = {
  pass: 'تمريرة',
  shot: 'تسديدة',
  carry: 'حمل الكرة',
  tackle: 'افتكاك',
  pressure: 'ضغط',
  possession_change: 'استحواذ',
  foul: 'خطأ',
  yellow_card: 'بطاقة صفراء',
  red_card: 'بطاقة حمراء',
  substitution: 'تبديل',
  offside: 'تسلل',
  counterattack: 'هجوم مرتد',
  reverse_attack: 'تحول هجومي',
  counter_press: 'ضغط مضاد',
}

export function eventTypeLabel(type: MatchEventType, locale: string): string {
  return locale === 'ar' ? EVENT_TYPE_LABELS_AR[type] : EVENT_TYPE_LABELS[type]
}
