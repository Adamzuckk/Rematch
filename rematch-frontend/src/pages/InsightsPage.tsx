import { useParams } from 'react-router-dom'
import {
  formatMatchLabel,
  useMatchSummary,
} from '../hooks/useMatchSummary'
import { PlaceholderPage } from './PlaceholderPage'

export function InsightsPage() {
  const { matchId } = useParams()
  const matchState = useMatchSummary(matchId)

  const label =
    matchState.status === 'ready'
      ? formatMatchLabel(matchState.match)
      : `Match ${matchId ?? ''}`

  return (
    <PlaceholderPage
      title={`Match insights — ${label}`}
      description="Grounded summaries, Fan/Analyst modes, and metric charts are not implemented yet."
      phaseHint="A later phase adds match insights backed by backend calculations and localization."
      details={[
        'Key moments linked to supporting events',
        'Fan Mode and Analyst Mode',
        'No invented operational metrics',
      ]}
    />
  )
}
