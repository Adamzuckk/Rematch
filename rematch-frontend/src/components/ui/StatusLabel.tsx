import type { MatchStatus } from '../../types/match'
import { useLocale } from '../../i18n/locale'
import styles from './StatusLabel.module.css'

type StatusKind = MatchStatus | 'demo'

interface StatusLabelProps {
  status: StatusKind
  showDot?: boolean
  className?: string
}

export function StatusLabel({
  status,
  showDot = status === 'live',
  className,
}: StatusLabelProps) {
  const { t } = useLocale()
  const label =
    status === 'live'
      ? t('filterLive')
      : status === 'finished'
        ? t('filterFinished')
        : status === 'upcoming'
          ? t('filterUpcoming')
          : t('statusSynthetic')
  return (
    <span className={[styles.label, styles[status], className ?? ''].join(' ')}>
      {showDot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {label}
    </span>
  )
}
