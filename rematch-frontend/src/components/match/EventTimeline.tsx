import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { MatchEvent } from '../../types'
import { formatEventMinute } from '../../lib/pitch'
import { Button } from '../ui/Button'
import { eventTypeLabel } from './eventLabels'
import styles from './EventTimeline.module.css'

export interface EventTimelineProps {
  events: readonly MatchEvent[]
  selectedEventId: string | null
  onSelect: (eventId: string) => void
  onPrevious: () => void
  onNext: () => void
  canPrevious: boolean
  canNext: boolean
  locale?: 'en' | 'ar'
  labels?: {
    heading?: string
    empty?: string
    previous?: string
    next?: string
    selected?: string
  }
}

export function EventTimeline({
  events,
  selectedEventId,
  onSelect,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
  locale = 'en',
  labels = {},
}: EventTimelineProps) {
  const heading = labels.heading ?? 'Event timeline'
  const empty = labels.empty ?? 'No events available for this match.'
  const previousLabel = labels.previous ?? 'Previous event'
  const nextLabel = labels.next ?? 'Next event'
  const selectedHint = labels.selected ?? 'Selected'

  return (
    <section className={styles.root} aria-label={heading}>
      <div className={styles.header}>
        <h2 className={styles.title}>{heading}</h2>
        <div className={styles.controls}>
          <Button
            variant="secondary"
            onClick={onPrevious}
            disabled={!canPrevious}
            aria-label={previousLabel}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            {previousLabel}
          </Button>
          <Button
            variant="secondary"
            onClick={onNext}
            disabled={!canNext}
            aria-label={nextLabel}
          >
            {nextLabel}
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {events.length === 0 ? (
        <p className={styles.empty} role="status">
          {empty}
        </p>
      ) : (
        <ol className={styles.list} role="listbox" aria-label={heading}>
          {events.map((event) => {
            const selected = event.id === selectedEventId
            return (
              <li key={event.id} className={styles.item}>
                <button
                  type="button"
                  className={[
                    styles.eventButton,
                    selected ? styles.selected : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelect(event.id)}
                  aria-selected={selected}
                  role="option"
                  aria-label={`${eventTypeLabel(event.type, locale)} ${locale === 'ar' ? 'في' : 'at'} ${formatEventMinute(event.minute)}${selected ? `, ${selectedHint}` : ''}`}
                >
                  <span className={styles.minute}>
                    {formatEventMinute(event.minute)}
                  </span>
                  <span className={styles.type}>
                    {eventTypeLabel(event.type, locale)}
                  </span>
                  {selected ? (
                    <span className={styles.selectedBadge} aria-hidden="true">
                      {selectedHint}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
