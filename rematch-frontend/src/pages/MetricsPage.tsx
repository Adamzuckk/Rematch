import { PlaceholderPage } from './PlaceholderPage'
import { useLocale } from '../i18n/locale'

export function MetricsPage() {
  const { t } = useLocale()
  return (
    <PlaceholderPage
      title={t('metricsTitle')}
      description={t('metricsDescription')}
      phaseHint={t('metricsPhaseHint')}
      details={[
        t('metricsDetailEvidence'),
        t('metricsDetailCoverage'),
        t('metricsDetailSource'),
      ]}
    />
  )
}
