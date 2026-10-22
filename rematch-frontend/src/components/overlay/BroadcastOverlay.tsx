import styles from './BroadcastOverlay.module.css'
import type { OverlayPayload } from './overlayTypes'

interface BroadcastOverlayProps {
  payload: OverlayPayload | null
  visible: boolean
}

/** On-screen strip suitable for studio-style accompaniment (not live broadcast rights). */
export function BroadcastOverlay({ payload, visible }: BroadcastOverlayProps) {
  if (!visible || !payload) return null
  return (
    <div className={styles.strip} role="status" aria-live="polite">
      <div className={styles.meta}>
        <span className={styles.badge}>{payload.provenance}</span>
        <span>{payload.matchLabel}</span>
        <span>{payload.minuteLabel}</span>
        <span className={styles.type}>{payload.eventType}</span>
      </div>
      <strong className={styles.headline}>{payload.headline}</strong>
      <p className={styles.detail}>{payload.detail}</p>
    </div>
  )
}
