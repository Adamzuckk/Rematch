import { useParams } from 'react-router-dom'
import { PlaceholderPage } from './PlaceholderPage'

export function DecisionExplorerPage() {
  const { matchId, eventId } = useParams()

  return (
    <PlaceholderPage
      title="Decision Explorer"
      description={`Route is wired for match ${matchId ?? '—'} / event ${eventId ?? '—'}. Decision comparison UI is not implemented yet.`}
      phaseHint="Phases 5–6 deliver backend decision values, alternatives, evidence, and this explorer UI."
      details={[
        'Actual recorded decision vs alternatives',
        'Evidence and verification status',
        'Distinction between decision quality and execution outcome',
      ]}
    />
  )
}
