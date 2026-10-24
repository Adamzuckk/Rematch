import type { MatchEvent, Player, Team } from '../../types'
import {
  buildMatchHighlights,
  type MatchHighlightKind,
} from '../../lib/matchHighlights'
import { formatEventMinute } from '../../lib/pitch'
import { useLocale } from '../../i18n/locale'
import type { MessageKey } from '../../i18n/strings'
import { eventTypeLabel } from './eventLabels'
import styles from './MatchHighlightsStrip.module.css'

const KIND_LABEL: Record<MatchHighlightKind, MessageKey> = {
  goal: 'matchHighlightGoal',
  shot: 'matchHighlightShot',
  decision: 'matchHighlightDecision',
  significant: 'matchHighlightSignificant',
}

export interface MatchHighlightsStripProps {
  events: readonly MatchEvent[]
  selectedEventId: string | null
  homeTeam: Team
  awayTeam: Team
  players: readonly Player[]
  onSelectEvent: (eventId: string) => void
}

function resolveTeamShort(
  teamId: string | undefined,
  homeTeam: Team,
  awayTeam: Team,
): string | null {
  if (!teamId) return null
  if (teamId === homeTeam.id) return homeTeam.shortName ?? homeTeam.name
  if (teamId === awayTeam.id) return awayTeam.shortName ?? awayTeam.name
  return null
}

function resolvePlayerName(
  playerId: string | undefined,
  players: readonly Player[],
): string | null {
  if (!playerId) return null
  return players.find((player) => player.id === playerId)?.name ?? null
}

export function MatchHighlightsStrip({
  events,
  selectedEventId,
  homeTeam,
  awayTeam,
  players,
  onSelectEvent,
}: MatchHighlightsStripProps) {
  const { t, locale } = useLocale()
  const highlights = buildMatchHighlights(events)

  if (highlights.length === 0) {
    return (
      <section
        className={styles.root}
        aria-label={t('matchHighlightsLabel')}
        data-testid="match-highlights"
      >
        <p className={styles.empty} role="status">
          {t('matchHighlightsEmpty')}
        </p>
      </section>
    )
  }

  return (
    <section
      className={styles.root}
      aria-label={t('matchHighlightsLabel')}
      data-testid="match-highlights"
    >
      <div className={styles.head}>
        <h2 className={styles.title}>{t('matchHighlightsTitle')}</h2>
        <p className={styles.hint}>{t('matchHighlightsHint')}</p>
      </div>
      <ul className={styles.list} role="list">
        {highlights.map((item) => {
          const selected = item.eventId === selectedEventId
          const team = resolveTeamShort(item.teamId, homeTeam, awayTeam)
          const player = resolvePlayerName(item.playerId, players)
          const minute = formatEventMinute(item.minute)
          const kindLabel = t(KIND_LABEL[item.kind])
          const typeLabel = eventTypeLabel(item.eventType, locale)
          return (
            <li key={item.eventId}>
              <button
                type="button"
                className={[
                  styles.chip,
                  styles[`kind_${item.kind}`],
                  selected ? styles.chipSelected : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelectEvent(item.eventId)}
                aria-pressed={selected}
                aria-label={`${kindLabel}, ${typeLabel} ${minute}${team ? `, ${team}` : ''}${player ? `, ${player}` : ''}`}
                data-testid={`match-highlight-${item.eventId}`}
              >
                <span className={styles.chipKind}>{kindLabel}</span>
                <span className={styles.chipMinute}>{minute}</span>
                <span className={styles.chipMeta}>
                  {[team, player].filter(Boolean).join(' · ') || typeLabel}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
