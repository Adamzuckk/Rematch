import { NavLink } from 'react-router-dom'
import { Activity, Gavel, LayoutDashboard, X } from 'lucide-react'
import rematchLogo from '../../assets/brand/rematch_logo_transparent.png'
import { useLocale } from '../../i18n/locale'
import { Button } from '../../components/ui/Button'
import styles from './Sidebar.module.css'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'navDashboard' as const },
  { to: '/judge', icon: Gavel, labelKey: 'navJudge' as const },
  { to: '/metrics', icon: Activity, labelKey: 'navMetrics' as const },
]

export function Sidebar({ open, onClose }: SidebarProps) {
  const { t, locale, setLocale } = useLocale()

  return (
    <aside
      className={[styles.sidebar, open ? styles.sidebarOpen : ''].join(' ')}
      aria-label="Primary"
      id="app-sidebar"
    >
      <div className={styles.closeRow}>
        <Button
          variant="ghost"
          iconOnly
          onClick={onClose}
          aria-label={t('closeMenu')}
        >
          <X size={20} aria-hidden="true" />
        </Button>
      </div>

      <div className={styles.brand}>
        <div className={styles.brandMark}>
          <img
            src={rematchLogo}
            alt={t('appName')}
            className={styles.logoMark}
            decoding="async"
          />
        </div>
        <p className={styles.brandTag}>{t('tagline')}</p>
      </div>

      <nav className={styles.nav} aria-label="Main">
        <p className={styles.navLabel}>{t('navExplore')}</p>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [styles.link, isActive ? styles.linkActive : ''].join(' ')
              }
              onClick={onClose}
            >
              <Icon size={18} aria-hidden="true" />
              {t(item.labelKey)}
            </NavLink>
          )
        })}
      </nav>

      <div className={styles.footer}>
        <p className={styles.demoNote}>
          {t('syntheticDemoNotice')}
        </p>
        <div
          className={styles.langRow}
          role="group"
          aria-label={t('language')}
        >
          <Button
            variant={locale === 'en' ? 'primary' : 'secondary'}
            className={styles.langButton}
            onClick={() => setLocale('en')}
            aria-pressed={locale === 'en'}
          >
            EN
          </Button>
          <Button
            variant={locale === 'ar' ? 'primary' : 'secondary'}
            className={styles.langButton}
            onClick={() => setLocale('ar')}
            aria-pressed={locale === 'ar'}
          >
            AR
          </Button>
        </div>
      </div>
    </aside>
  )
}
