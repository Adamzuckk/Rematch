import type { MatchStatus } from '../../types/match'
import styles from './StatusLabel.module.css'

type StatusKind = MatchStatus | 'demo'

const LABELS: Record<StatusKind, string> = {
  live: 'Live',
  finished: 'Finished',
  upcoming: 'Upcoming',
  demo: 'Synthetic demo data',
}

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
  return (
    <span className={[styles.label, styles[status], className ?? ''].join(' ')}>
      {showDot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {LABELS[status]}
    </span>
  )
}
