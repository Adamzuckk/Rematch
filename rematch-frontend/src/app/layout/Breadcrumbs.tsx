import { Link, useLocation, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import {
  formatMatchLabel,
  useMatchSummary,
} from '../../hooks/useMatchSummary'
import { useLocale } from '../../i18n/locale'
import styles from './Breadcrumbs.module.css'

interface Crumb {
  label: string
  to?: string
}

function useCrumbs(): Crumb[] {
  const location = useLocation()
  const params = useParams()
  const { t } = useLocale()
  const matchState = useMatchSummary(params.matchId)

  const matchLabel =
    matchState.status === 'ready'
      ? formatMatchLabel(matchState.match)
      : params.matchId
        ? `Match ${params.matchId}`
        : t('breadcrumbMatch')

  const path = location.pathname

  if (path.startsWith('/metrics')) {
    return [
      { label: t('navDashboard'), to: '/dashboard' },
      { label: t('navMetrics') },
    ]
  }

  if (path.includes('/pick-your-pass')) {
    return [
      { label: t('navDashboard'), to: '/dashboard' },
      { label: matchLabel, to: `/matches/${params.matchId}` },
      {
        label: t('breadcrumbDecisionExplorer'),
        to: `/matches/${params.matchId}/decisions/${params.eventId}`,
      },
      { label: t('breadcrumbPickPass') },
    ]
  }

  if (path.includes('/decisions/')) {
    return [
      { label: t('navDashboard'), to: '/dashboard' },
      { label: matchLabel, to: `/matches/${params.matchId}` },
      { label: t('breadcrumbDecisionExplorer') },
    ]
  }

  if (path.includes('/insights')) {
    return [
      { label: t('navDashboard'), to: '/dashboard' },
      { label: matchLabel, to: `/matches/${params.matchId}` },
      { label: t('breadcrumbInsights') },
    ]
  }

  if (path.startsWith('/matches/')) {
    return [
      { label: t('navDashboard'), to: '/dashboard' },
      { label: matchLabel },
    ]
  }

  return [{ label: t('navDashboard') }]
}

export function Breadcrumbs() {
  const { t } = useLocale()
  const crumbs = useCrumbs()

  return (
    <nav className={styles.nav} aria-label={t('breadcrumbs')}>
      <ol className={styles.list}>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <li key={`${crumb.label}-${index}`} className={styles.item}>
              {index > 0 ? (
                <ChevronRight
                  className={styles.separator}
                  size={14}
                  aria-hidden="true"
                />
              ) : null}
              {crumb.to && !isLast ? (
                <Link to={crumb.to} className={styles.link}>
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={styles.current}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
