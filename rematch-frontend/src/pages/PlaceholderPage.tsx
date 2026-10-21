import { Button } from '../components/ui/Button'
import { useLocale } from '../i18n/locale'
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
  const { t } = useLocale()
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{t('comingSoonEyebrow')}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lead}>{description}</p>
      </header>

      <section className={styles.panel} aria-label={t('implementationStatus')}>
        <h2 className={styles.panelTitle}>{t('comingSoonTitle')}</h2>
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
            {t('backToDashboard')}
          </Button>
        </div>
      </section>
    </div>
  )
}
