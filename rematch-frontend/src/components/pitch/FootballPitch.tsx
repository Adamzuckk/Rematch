import { useId, type KeyboardEvent } from 'react'
import type { MatchEvent, MatchFrame, Team } from '../../types'
import type { PitchPoint } from '../../types/coordinates'
import {
  getEventGeometry,
  mapPitchPointToSvgClamped,
  PITCH_VIEWBOX,
} from '../../lib/pitch'
import styles from './FootballPitch.module.css'

export interface FootballPitchProps {
  homeTeam: Team
  awayTeam: Team
  selectedEvent?: MatchEvent | null
  frame?: MatchFrame | null
  /** Accessible name for the pitch diagram */
  label?: string
  locale?: 'en' | 'ar'
  className?: string
  highlightedPath?: { start: PitchPoint; end: PitchPoint } | null
  selectablePlayerIds?: string[]
  selectedPlayerId?: string | null
  onSelectPlayer?: (playerId: string) => void
  selectPlayerLabel?: (playerId: string) => string
}

const { width: W, height: H } = PITCH_VIEWBOX

/** FIFA-derived markings in viewBox units (105×68 scaled ×10). */
const MARK = {
  penaltyDepth: 165,
  penaltyWidth: 403.2,
  goalDepth: 55,
  goalWidth: 183.2,
  centerRadius: 91.5,
  penaltySpot: 110,
  cornerRadius: 20,
  goalMouth: 73.2,
} as const

function teamSide(
  teamId: string | undefined,
  homeTeamId: string,
  awayTeamId: string,
): 'home' | 'away' | 'unknown' {
  if (!teamId) return 'unknown'
  if (teamId === homeTeamId) return 'home'
  if (teamId === awayTeamId) return 'away'
  return 'unknown'
}

export function FootballPitch({
  homeTeam,
  awayTeam,
  selectedEvent = null,
  frame = null,
  label = 'Football pitch',
  locale = 'en',
  className,
  highlightedPath = null,
  selectablePlayerIds = [],
  selectedPlayerId = null,
  onSelectPlayer,
  selectPlayerLabel = (playerId) => `Select pass to player ${playerId}`,
}: FootballPitchProps) {
  // SVG fragment identifiers are document-global. A component-scoped ID avoids
  // one pitch borrowing another pitch's stripe pattern when two are mounted.
  const stripePatternId = `pitch-stripes-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const geometry = selectedEvent ? getEventGeometry(selectedEvent) : {}
  const locationSvg = geometry.location
    ? mapPitchPointToSvgClamped(geometry.location)
    : null
  const pathStart = geometry.path
    ? mapPitchPointToSvgClamped(geometry.path.start)
    : null
  const pathEnd = geometry.path
    ? mapPitchPointToSvgClamped(geometry.path.end)
    : null
  const selectedStart = highlightedPath
    ? mapPitchPointToSvgClamped(highlightedPath.start)
    : null
  const selectedEnd = highlightedPath
    ? mapPitchPointToSvgClamped(highlightedPath.end)
    : null

  const players = frame?.players ?? []
  // Event, player, and ball data all share one normalized coordinate system.
  // Clamp finite upstream edge drift consistently; reject non-finite points.
  const ballSvg = frame?.ball
    ? mapPitchPointToSvgClamped(frame.ball.position)
    : null

  const penaltyY = (H - MARK.penaltyWidth) / 2
  const goalY = (H - MARK.goalWidth) / 2
  const goalMouthY = (H - MARK.goalMouth) / 2

  return (
    <figure className={[styles.root, className ?? ''].filter(Boolean).join(' ')}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{label}</title>
        <defs>
          <pattern
            id={stripePatternId}
            width="70"
            height={H}
            patternUnits="userSpaceOnUse"
          >
            <rect width="35" height={H} className={styles.stripeA} />
            <rect x="35" width="35" height={H} className={styles.stripeB} />
          </pattern>
        </defs>

        <rect width={W} height={H} fill={`url(#${stripePatternId})`} />

        {/* Boundary */}
        <rect
          x={2}
          y={2}
          width={W - 4}
          height={H - 4}
          className={styles.line}
          fill="none"
        />

        {/* Halfway line */}
        <line x1={W / 2} y1={2} x2={W / 2} y2={H - 2} className={styles.line} />

        {/* Center circle + spot */}
        <circle
          cx={W / 2}
          cy={H / 2}
          r={MARK.centerRadius}
          className={styles.line}
          fill="none"
        />
        <circle cx={W / 2} cy={H / 2} r={4} className={styles.spot} />

        {/* Left penalty / goal areas */}
        <rect
          x={2}
          y={penaltyY}
          width={MARK.penaltyDepth}
          height={MARK.penaltyWidth}
          className={styles.line}
          fill="none"
        />
        <rect
          x={2}
          y={goalY}
          width={MARK.goalDepth}
          height={MARK.goalWidth}
          className={styles.line}
          fill="none"
        />
        <circle cx={MARK.penaltySpot} cy={H / 2} r={4} className={styles.spot} />
        <path
          d={`M ${MARK.penaltyDepth} ${H / 2 - MARK.centerRadius}
              A ${MARK.centerRadius} ${MARK.centerRadius} 0 0 1 ${MARK.penaltyDepth} ${H / 2 + MARK.centerRadius}`}
          className={styles.line}
          fill="none"
        />

        {/* Right penalty / goal areas */}
        <rect
          x={W - 2 - MARK.penaltyDepth}
          y={penaltyY}
          width={MARK.penaltyDepth}
          height={MARK.penaltyWidth}
          className={styles.line}
          fill="none"
        />
        <rect
          x={W - 2 - MARK.goalDepth}
          y={goalY}
          width={MARK.goalDepth}
          height={MARK.goalWidth}
          className={styles.line}
          fill="none"
        />
        <circle
          cx={W - MARK.penaltySpot}
          cy={H / 2}
          r={4}
          className={styles.spot}
        />
        <path
          d={`M ${W - MARK.penaltyDepth} ${H / 2 - MARK.centerRadius}
              A ${MARK.centerRadius} ${MARK.centerRadius} 0 0 0 ${W - MARK.penaltyDepth} ${H / 2 + MARK.centerRadius}`}
          className={styles.line}
          fill="none"
        />

        {/* Goal mouths (visual only) */}
        <rect
          x={2}
          y={goalMouthY}
          width={10}
          height={MARK.goalMouth}
          className={styles.goal}
        />
        <rect
          x={W - 12}
          y={goalMouthY}
          width={10}
          height={MARK.goalMouth}
          className={styles.goal}
        />

        {/* Corner arcs */}
        <path
          d={`M 2 ${2 + MARK.cornerRadius} A ${MARK.cornerRadius} ${MARK.cornerRadius} 0 0 0 ${2 + MARK.cornerRadius} 2`}
          className={styles.line}
          fill="none"
        />
        <path
          d={`M ${W - 2 - MARK.cornerRadius} 2 A ${MARK.cornerRadius} ${MARK.cornerRadius} 0 0 0 ${W - 2} ${2 + MARK.cornerRadius}`}
          className={styles.line}
          fill="none"
        />
        <path
          d={`M 2 ${H - 2 - MARK.cornerRadius} A ${MARK.cornerRadius} ${MARK.cornerRadius} 0 0 1 ${2 + MARK.cornerRadius} ${H - 2}`}
          className={styles.line}
          fill="none"
        />
        <path
          d={`M ${W - 2} ${H - 2 - MARK.cornerRadius} A ${MARK.cornerRadius} ${MARK.cornerRadius} 0 0 1 ${W - 2 - MARK.cornerRadius} ${H - 2}`}
          className={styles.line}
          fill="none"
        />

        {/* Event path */}
        {pathStart && pathEnd ? (
          <line
            key={`event-path-${selectedEvent?.id ?? ''}-${pathStart.x}-${pathStart.y}-${pathEnd.x}-${pathEnd.y}`}
            x1={pathStart.x}
            y1={pathStart.y}
            x2={pathEnd.x}
            y2={pathEnd.y}
            className={styles.eventPath}
            data-testid="event-path"
          />
        ) : null}
        {selectedStart && selectedEnd ? (
          <line
            key={`selected-path-${selectedStart.x}-${selectedStart.y}-${selectedEnd.x}-${selectedEnd.y}`}
            x1={selectedStart.x}
            y1={selectedStart.y}
            x2={selectedEnd.x}
            y2={selectedEnd.y}
            className={styles.selectedPath}
            data-testid="selected-pass-path"
          />
        ) : null}

        {/* Event location */}
        {locationSvg ? (
          <g
            key={`event-location-${selectedEvent?.id ?? ''}-${locationSvg.x}-${locationSvg.y}`}
            transform={`translate(${locationSvg.x}, ${locationSvg.y})`}
            data-testid="event-location"
          >
            <circle r={14} className={styles.eventHalo} />
            <circle r={7} className={styles.eventMarker} />
            <title>
              {selectedEvent
                ? `Selected ${selectedEvent.type} location`
                : 'Event location'}
            </title>
          </g>
        ) : null}

        {/* Player markers from frame only */}
        {players.map((player) => {
          const svgPoint = mapPitchPointToSvgClamped(player.position)
          if (!svgPoint) return null
          const side = teamSide(player.teamId, homeTeam.id, awayTeam.id)
          const teamLabel =
            side === 'home'
              ? homeTeam.name
              : side === 'away'
                ? awayTeam.name
                : 'Unknown team'
          const selectable = selectablePlayerIds.includes(player.playerId)
          const markerProps = selectable
            ? {
                role: 'button' as const,
                tabIndex: 0,
                'aria-label': selectPlayerLabel(player.playerId),
                'aria-pressed': selectedPlayerId === player.playerId,
                onClick: () => onSelectPlayer?.(player.playerId),
                onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectPlayer?.(player.playerId)
                  }
                },
              }
            : {}
          return (
            <g
              key={`${player.playerId}-${player.teamId}`}
              transform={`translate(${svgPoint.x}, ${svgPoint.y})`}
              data-testid="player-marker"
              data-team={side}
              data-selectable={selectable || undefined}
              {...markerProps}
            >
              <circle
                r={11}
                className={[
                  side === 'home'
                    ? styles.playerHome
                    : side === 'away'
                      ? styles.playerAway
                      : styles.playerUnknown,
                  selectable ? styles.playerSelectable : '',
                  selectedPlayerId === player.playerId ? styles.playerSelected : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="img"
                aria-label={`Player ${player.playerId}, ${teamLabel}`}
              >
                <title>{`Player ${player.playerId} (${teamLabel})`}</title>
              </circle>
            </g>
          )
        })}

        {/* Ball marker from frame only */}
        {ballSvg ? (
          <g
            transform={`translate(${ballSvg.x}, ${ballSvg.y})`}
            data-testid="ball-marker"
          >
            <circle
              r={8}
              className={styles.ball}
              role="img"
              aria-label="Ball"
            >
              <title>Ball</title>
            </circle>
          </g>
        ) : null}
      </svg>

      <figcaption className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={[styles.swatch, styles.swatchHome].join(' ')} />
          {homeTeam.shortName ?? homeTeam.name}
        </span>
        <span className={styles.legendItem}>
          <span className={[styles.swatch, styles.swatchAway].join(' ')} />
          {awayTeam.shortName ?? awayTeam.name}
        </span>
        <span className={styles.legendItem}>
          <span className={[styles.swatch, styles.swatchEvent].join(' ')} />
          {locale === 'ar' ? 'حدث' : 'Event'}
        </span>
        {frame == null || players.length === 0 ? (
          <span className={styles.legendNote}>
            {locale === 'ar'
              ? 'لا يوجد إطار للاعبين لهذه اللحظة'
              : 'No player frame for this moment'}
          </span>
        ) : null}
      </figcaption>
    </figure>
  )
}
