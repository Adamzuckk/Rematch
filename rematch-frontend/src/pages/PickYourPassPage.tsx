import { useParams } from 'react-router-dom'
import { PlaceholderPage } from './PlaceholderPage'

export function PickYourPassPage() {
  const { matchId, eventId } = useParams()

  return (
    <PlaceholderPage
      title="Pick Your Pass"
      description={`Interactive pass selection for match ${matchId ?? '—'} / event ${eventId ?? '—'} is not available yet.`}
      phaseHint="Phase 7 will let users select a valid target, submit to the backend, and compare against calculated alternatives."
      details={[
        'Valid target selection on the pitch',
        'Submit choice when API is connected',
        'Comparison with recorded decision and alternatives',
      ]}
    />
  )
}
