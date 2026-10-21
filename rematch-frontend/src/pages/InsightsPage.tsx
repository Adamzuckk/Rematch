import { useParams } from 'react-router-dom'
import {
  formatMatchLabel,
  useMatchSummary,
} from '../hooks/useMatchSummary'
import { PlaceholderPage } from './PlaceholderPage'
import { useLocale } from '../i18n/locale'

export function InsightsPage() {
  const { t } = useLocale()
  const { matchId } = useParams()
  const matchState = useMatchSummary(matchId)

  const label =
    matchState.status === 'ready'
      ? formatMatchLabel(matchState.match)
      : `${t('breadcrumbMatch')} ${matchId ?? ''}`

  return (
    <PlaceholderPage
      title={`${t('insightsTitle')} — ${label}`}
      description={t('insightsDescription')}
      phaseHint={t('insightsPhaseHint')}
      details={[
        t('insightsDetailMoments'),
        t('insightsDetailModes'),
        t('insightsDetailEvidence'),
      ]}
    />
  )
}
