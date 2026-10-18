import { PlaceholderPage } from './PlaceholderPage'

export function MetricsPage() {
  return (
    <PlaceholderPage
      title="System Metrics"
      description="Operational metrics are not measured yet. This page intentionally shows no fabricated latency or verification rates."
      phaseHint="Phase 9 will surface verified/rejected/fallback counts and latency only from recorded backend runs."
      details={[
        'Evidence support and verifier outcomes',
        'Analysis coverage when actually measured',
        'Clear source and scope labels',
      ]}
    />
  )
}
