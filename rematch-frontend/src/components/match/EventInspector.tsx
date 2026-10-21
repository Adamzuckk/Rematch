import type { MatchEvent, MatchFrame, Player, Team } from '../../types'
import {
  formatEventMinute,
  getEventGeometry,
  isDecisionCandidate,
} from '../../lib/pitch'
import { Button } from '../ui/Button'
import { eventTypeLabel } from './eventLabels'
import { useLocale } from '../../i18n/locale'
import styles from './EventInspector.module.css'

export interface EventInspectorProps {
  matchId: string
  event: MatchEvent | null
  homeTeam: Team
  awayTeam: Team
  players: readonly Player[]
  frame?: MatchFrame | null
  labels?: {
    heading?: string
    empty?: string
    missing?: string
    decisionCta?: string
    decisionHint?: string
    fields?: {
      type: string
      minute: string
      occurredAt: string
      team: string
      player: string
      receiver: string
      possessionGained: string
      outcome: string
      location: string
      pathStart: string
      pathEnd: string
      provenance: string
      frame: string
    }
  }
}

function resolveTeamName(
  teamId: string | undefined,
  homeTeam: Team,
  awayTeam: Team,
): string | null {
  if (!teamId) return null
  if (teamId === homeTeam.id) return homeTeam.name
  if (teamId === awayTeam.id) return awayTeam.name
  return null
}

function resolvePlayerName(
  playerId: string | undefined,
  players: readonly Player[],
): string | null {
  if (!playerId) return null
  return players.find((player) => player.id === playerId)?.name ?? null
}

function formatPoint(point: { x: number; y: number } | undefined): string | null {
  if (!point) return null
  return `x ${point.x.toFixed(1)}, y ${point.y.toFixed(1)}`
}

function DetailRow({
  label,
  value,
  missingLabel,
}: {
  label: string
  value: string | null | undefined
  missingLabel: string
}) {
  const known = value != null && value !== ''
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd className={known ? undefined : styles.missing}>
        {known ? value : missingLabel}
      </dd>
    </div>
  )
}

export function EventInspector({
  matchId,
  event,
  homeTeam,
  awayTeam,
  players,
  frame = null,
  labels = {},
}: EventInspectorProps) {
  const { t, locale } = useLocale()
  const heading = labels.heading ?? 'Event details'
  const empty = labels.empty ?? 'Select an event to inspect its details.'
  const missing = labels.missing ?? 'Not available'
  const decisionCta = labels.decisionCta ?? 'Open Decision Explorer'
  const decisionHint =
    labels.decisionHint ??
    'Compare the observed action with geometric alternatives from the decision engine.'
  const fields = labels.fields ?? {
    type: t('eventFieldType'),
    minute: t('eventFieldMinute'),
    occurredAt: t('eventFieldOccurredAt'),
    team: t('eventFieldTeam'),
    player: t('eventFieldPlayer'),
    receiver: t('eventFieldReceiver'),
    possessionGained: t('eventFieldPossessionGained'),
    outcome: t('eventFieldOutcome'),
    location: t('eventFieldLocation'),
    pathStart: t('eventFieldPathStart'),
    pathEnd: t('eventFieldPathEnd'),
    provenance: t('eventFieldProvenance'),
    frame: t('eventFieldFrame'),
  }

  if (!event) {
    return (
      <section className={styles.root} aria-label={heading}>
        <h2 className={styles.title}>{heading}</h2>
        <p className={styles.empty} role="status">
          {empty}
        </p>
      </section>
    )
  }

  const geometry = getEventGeometry(event)
  const teamName = resolveTeamName(event.teamId, homeTeam, awayTeam)
  const playerName = resolvePlayerName(event.playerId, players)
  const receiverName =
    event.type === 'pass'
      ? resolvePlayerName(event.receiverId, players)
      : null
  const gainedBy =
    event.type === 'possession_change'
      ? resolveTeamName(event.gainedByTeamId, homeTeam, awayTeam)
      : null

  const outcome =
    event.type === 'pass' ||
    event.type === 'shot' ||
    event.type === 'tackle'
      ? event.outcome
      : undefined

  const showDecision = isDecisionCandidate(event)

  return (
    <section className={styles.root} aria-label={heading}>
      <h2 className={styles.title}>{heading}</h2>

      <dl className={styles.list}>
        <DetailRow
          label={fields.type}
          value={eventTypeLabel(event.type, locale)}
          missingLabel={missing}
        />
        <DetailRow
          label={fields.minute}
          value={
            event.minute != null ? formatEventMinute(event.minute) : null
          }
          missingLabel={missing}
        />
        <DetailRow
          label={fields.occurredAt}
          value={event.occurredAt ?? null}
          missingLabel={missing}
        />
        <DetailRow
          label={fields.team}
          value={
            teamName ??
            (event.teamId ? `Unresolved (${event.teamId})` : null)
          }
          missingLabel={missing}
        />
        <DetailRow
          label={fields.player}
          value={
            playerName ??
            (event.playerId ? `Unresolved (${event.playerId})` : null)
          }
          missingLabel={missing}
        />
        {event.type === 'pass' ? (
          <DetailRow
            label={fields.receiver}
            value={
              receiverName ??
              (event.receiverId ? `Unresolved (${event.receiverId})` : null)
            }
            missingLabel={missing}
          />
        ) : null}
        {event.type === 'possession_change' ? (
          <DetailRow
            label={fields.possessionGained}
            value={
              gainedBy ??
              (event.gainedByTeamId
                ? `Unresolved (${event.gainedByTeamId})`
                : null)
            }
            missingLabel={missing}
          />
        ) : null}
        {outcome != null ? (
          <DetailRow label={fields.outcome} value={outcome} missingLabel={missing} />
        ) : null}
        <DetailRow
          label={fields.location}
          value={formatPoint(geometry.location)}
          missingLabel={missing}
        />
        {geometry.path ? (
          <>
            <DetailRow
              label={fields.pathStart}
              value={formatPoint(geometry.path.start)}
              missingLabel={missing}
            />
            <DetailRow
              label={fields.pathEnd}
              value={formatPoint(geometry.path.end)}
              missingLabel={missing}
            />
          </>
        ) : null}
        <DetailRow
          label={fields.provenance}
          value={event.provenance}
          missingLabel={missing}
        />
        <DetailRow
          label={fields.frame}
          value={
            frame
              ? `${frame.id} · ${frame.players.length} player marker(s)${
                  frame.ball ? ' · ball present' : ' · no ball'
                }`
              : null
          }
          missingLabel={missing}
        />
      </dl>

      {showDecision ? (
        <div className={styles.decision}>
          <p className={styles.decisionNote}>{decisionHint}</p>
          <Button
            variant="secondary"
            to={`/matches/${matchId}/decisions/${event.id}`}
          >
            {decisionCta}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
