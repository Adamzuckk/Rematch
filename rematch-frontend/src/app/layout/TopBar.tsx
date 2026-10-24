import { Menu } from 'lucide-react'
import rematchMark from '../../assets/brand/rematch-mark.svg'
import microsoftFoundryMark from '../../assets/brand/microsoft-foundry.svg'
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
        <div
          className={styles.modeSwitch}
          role="group"
          aria-label={t('modeSwitchLabel')}
          data-testid="persona-mode-switch"
        >
          <button
            type="button"
            className={mode === 'fan' ? styles.modeActive : styles.modeBtn}
            aria-pressed={mode === 'fan'}
            onClick={() => setMode('fan')}
            data-testid="persona-mode-fan"
          >
            {t('modeFan')}
          </button>
          <button
            type="button"
            className={mode === 'analyst' ? styles.modeActive : styles.modeBtn}
            aria-pressed={mode === 'analyst'}
            onClick={() => setMode('analyst')}
            data-testid="persona-mode-analyst"
          >
            {t('modeAnalyst')}
          </button>
        </div>
        {apiMode ? (
          <span
            className={styles.foundryBadge}
            title={t('apiMode')}
            data-testid="data-source-foundry"
          >
            <img
              src={microsoftFoundryMark}
              alt=""
              className={styles.foundryMark}
              width={16}
              height={16}
              decoding="async"
            />
            <span className={styles.foundryLabel}>{t('microsoftFoundry')}</span>
          </span>
        ) : (
          <span className={styles.badge} data-testid="data-source-demo">
            {t('demoData')}
          </span>
        )}
      </div>
    </header>
  )
}
