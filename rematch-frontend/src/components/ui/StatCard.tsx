import { StatusLabel } from './StatusLabel'
import styles from './StatCard.module.css'

interface StatCardProps {
  label: string
  value: string
  hint: string
  isDemoValue: true
}

export function StatCard({ label, value, hint, isDemoValue }: StatCardProps) {
  return (
    <article className={styles.card} aria-label={`${label}: ${value}`}>
      <div className={styles.labelRow}>
        <span className={styles.label}>{label}</span>
        {isDemoValue ? <StatusLabel status="demo" showDot={false} /> : null}
      </div>
      <p className={styles.value}>{value}</p>
      <p className={styles.hint}>{hint}</p>
    </article>
  )
}
