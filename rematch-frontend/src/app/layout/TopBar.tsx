import { Menu } from 'lucide-react'
import rematchMark from '../../assets/brand/rematch-mark.svg'
import { useLocale } from '../../i18n/locale'
import { usePersona } from '../../context/PersonaContext'
import { Button } from '../../components/ui/Button'
import { Breadcrumbs } from './Breadcrumbs'
import styles from './TopBar.module.css'

interface TopBarProps {
  onOpenNav: () => void
  navOpen: boolean
}

export function TopBar({ onOpenNav, navOpen }: TopBarProps) {
  const { t } = useLocale()
  const { mode, setMode } = usePersona()
  const apiMode = import.meta.env.VITE_MATCH_DATA_SOURCE === 'api'

  return (
    <header className={styles.topbar}>
      <div className={styles.start}>
        <Button
          variant="ghost"
          iconOnly
          className={styles.menuButton}
          onClick={onOpenNav}
          aria-label={t('openMenu')}
          aria-controls="app-sidebar"
          aria-expanded={navOpen}
        >
          <Menu size={20} aria-hidden="true" />
        </Button>
        <Breadcrumbs />
        <span className={styles.title}>
          <img
            src={rematchMark}
            alt=""
            className={styles.titleMark}
            width={22}
            height={22}
            decoding="async"
          />
          {t('appName')}
        </span>
      </div>
      <div className={styles.end}>
        <div className={styles.modeSwitch} role="group" aria-label="View mode">
          <button
            type="button"
            className={mode === 'fan' ? styles.modeActive : styles.modeBtn}
            onClick={() => setMode('fan')}
          >
            {t('modeFan')}
          </button>
          <button
            type="button"
            className={mode === 'analyst' ? styles.modeActive : styles.modeBtn}
            onClick={() => setMode('analyst')}
          >
            {t('modeAnalyst')}
          </button>
        </div>
        <span className={styles.badge}>
          {apiMode ? t('apiMode') : t('demoData')}
        </span>
      </div>
    </header>
  )
}
