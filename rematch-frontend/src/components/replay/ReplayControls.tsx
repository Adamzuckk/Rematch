import styles from './ReplayControls.module.css'

export type ReplaySpeed = 0.5 | 1 | 1.5 | 2

interface ReplayControlsProps {
  playing: boolean
  speed: ReplaySpeed
  index: number
  total: number
  label: string
  playLabel: string
  pauseLabel: string
  onTogglePlay: () => void
  onSpeed: (speed: ReplaySpeed) => void
  onSeek: (index: number) => void
}

const SPEEDS: ReplaySpeed[] = [0.5, 1, 1.5, 2]

export function ReplayControls({
  playing,
  speed,
  index,
  total,
  label,
  playLabel,
  pauseLabel,
  onTogglePlay,
  onSpeed,
  onSeek,
}: ReplayControlsProps) {
  const max = Math.max(total - 1, 0)
  return (
    <div className={styles.bar} role="group" aria-label={label}>
      <button type="button" className={styles.play} onClick={onTogglePlay}>
        {playing ? pauseLabel : playLabel}
      </button>
      <input
        className={styles.slider}
        type="range"
        min={0}
        max={max}
        value={Math.min(index, max)}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={index}
      />
      <span className={styles.pos}>
        {total === 0 ? '0/0' : `${index + 1}/${total}`}
      </span>
      <div className={styles.speeds}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={s === speed ? styles.speedActive : styles.speed}
            onClick={() => onSpeed(s)}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}
