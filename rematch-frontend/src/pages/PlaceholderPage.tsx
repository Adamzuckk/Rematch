import { Button } from '../components/ui/Button'
import styles from './PlaceholderPage.module.css'

interface PlaceholderPageProps {
  title: string
  description: string
  phaseHint: string
  details?: string[]
}

export function PlaceholderPage({
  title,
  description,
  phaseHint,
  details = [],
}: PlaceholderPageProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Not implemented yet</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lead}>{description}</p>
      </header>

      <section className={styles.panel} aria-label="Implementation status">
        <h2 className={styles.panelTitle}>Coming in a later phase</h2>
        <p className={styles.panelBody}>{phaseHint}</p>
        {details.length > 0 ? (
          <ul className={styles.list}>
            {details.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        <div>
          <Button variant="secondary" to="/dashboard">
            Back to dashboard
          </Button>
        </div>
      </section>
    </div>
  )
}
