import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useLocale } from '../../i18n/locale'
import styles from './AppShell.module.css'

export function AppShell() {
  const { t } = useLocale()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const [pathForNav, setPathForNav] = useState(location.pathname)

  // Close the mobile drawer when the route changes (React "adjust state on prop change").
  if (location.pathname !== pathForNav) {
    setPathForNav(location.pathname)
    setNavOpen(false)
  }

  useEffect(() => {
    if (!navOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navOpen])

  return (
    <div className={styles.shell}>
      <div className={styles.pitchPulse} aria-hidden="true" />
      <div className={styles.touchline} aria-hidden="true" />
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label={t('closeMenu')}
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <div className={styles.mainColumn}>
        <TopBar onOpenNav={() => setNavOpen(true)} navOpen={navOpen} />
        <main className={styles.content} id="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
