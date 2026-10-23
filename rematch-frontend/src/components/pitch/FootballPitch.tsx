import { useId, type KeyboardEvent } from 'react'
import type { MatchEvent, MatchFrame, Player, Team } from '../../types'
import type { PitchPoint } from '../../types/coordinates'
import {
  getEventGeometry,
  mapPitchPointToSvg,
  PITCH_VIEWBOX,
} from '../../lib/pitch'
import { isValidPitchPoint } from '../../types/coordinates'
import styles from './FootballPitch.module.css'

export interface FootballPitchProps {
  homeTeam: Team
  awayTeam: Team
  selectedEvent?: MatchEvent | null
  frame?: MatchFrame | null
  /** Roster metadata lets frame markers show the actual shirt number. */
  players?: readonly Player[]
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
  players: roster = [],
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
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const stripePatternId = `pitch-stripes-${instanceId}`
  const turfShadeId = `pitch-shade-${instanceId}`
  const eventArrowId = `event-arrow-${instanceId}`
  const geometry = selectedEvent ? getEventGeometry(selectedEvent) : {}
  const locationSvg = geometry.location ? mapPitchPointToSvg(geometry.location) : null
  const pathStart = geometry.path
    ? mapPitchPointToSvg(geometry.path.start)
    : null
  const pathEnd = geometry.path
    ? mapPitchPointToSvg(geometry.path.end)
    : null
  const selectedStart = highlightedPath
    ? mapPitchPointToSvg(highlightedPath.start)
    : null
  const selectedEnd = highlightedPath
    ? mapPitchPointToSvg(highlightedPath.end)
    : null

  const framePlayers = frame?.players ?? []
  // Event, player, and ball data all share one normalized coordinate system.
  // Invalid points are omitted; clamping would fabricate a pitch location.
  const players = framePlayers.filter((player) => isValidPitchPoint(player.position))
  const ballSvg = frame?.ball
    ? mapPitchPointToSvg(frame.ball.position)
    : null
  const omittedFrameMarkers =
    framePlayers.length - players.length + (frame?.ball && !ballSvg ? 1 : 0)

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
          <radialGradient id={turfShadeId} cx="50%" cy="48%" r="70%">
            <stop offset="55%" stopColor="#0b2012" stopOpacity="0" />
            <stop offset="100%" stopColor="#061109" stopOpacity=".48" />
          </radialGradient>
          <marker
            id={eventArrowId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 1 1 L 9 5 L 1 9 z" className={styles.eventArrow} />
          </marker>
        </defs>

        <rect width={W} height={H} fill={`url(#${stripePatternId})`} />
        <rect width={W} height={H} fill={`url(#${turfShadeId})`} />

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
          data-testid="away-goal"
          data-goal-side="left"
          data-team="away"
        />
        <rect
          x={W - 12}
          y={goalMouthY}
          width={10}
          height={MARK.goalMouth}
          className={styles.goal}
          data-testid="home-goal"
          data-goal-side="right"
          data-team="home"
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
          <g
            key={`event-path-${selectedEvent?.id ?? ''}-${pathStart.x}-${pathStart.y}-${pathEnd.x}-${pathEnd.y}`}
            data-testid="event-path"
          >
            <line
              x1={pathStart.x}
              y1={pathStart.y}
              x2={pathEnd.x}
              y2={pathEnd.y}
              className={styles.eventPathUnderlay}
            />
            <line
              x1={pathStart.x}
              y1={pathStart.y}
              x2={pathEnd.x}
              y2={pathEnd.y}
              className={styles.eventPath}
              markerEnd={`url(#${eventArrowId})`}
            />
          </g>
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
            <circle r={19} className={styles.eventHalo} />
            <g className={styles.eventToken} aria-hidden="true">
              <circle r={11} className={styles.eventMarker} />
              <path
                d="M 0 -6 L 5 -2 L 3 4 L -3 4 L -5 -2 Z M -5 -2 L -9 -5 M 5 -2 L 9 -5 M 3 4 L 6 8 M -3 4 L -6 8"
                className={styles.eventBallSeam}
              />
            </g>
            <title>
              {selectedEvent
                ? `Selected ${selectedEvent.type} location`
                : 'Event location'}
            </title>
          </g>
        ) : null}

        {/* Player markers from frame only */}
        {players.map((player) => {
          const svgPoint = mapPitchPointToSvg(player.position)
          if (!svgPoint) return null
          const side = teamSide(player.teamId, homeTeam.id, awayTeam.id)
          const teamLabel =
            side === 'home'
              ? homeTeam.name
              : side === 'away'
                ? awayTeam.name
                : 'Unknown team'
          const selectable = selectablePlayerIds.includes(player.playerId)
          const rosterPlayer = roster.find((item) => item.id === player.playerId)
          const shirtNumber = rosterPlayer?.shirtNumber
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
              className={styles.playerMotion}
              data-testid="player-marker"
              data-team={side}
              data-selectable={selectable || undefined}
              {...markerProps}
            >
              <ellipse cx="0" cy="12" rx="10" ry="3.2" className={styles.playerShadow} />
              {selectedPlayerId === player.playerId ? (
                <circle r={17} className={styles.playerSelected} aria-hidden="true" />
              ) : null}
              <path
                d="M -6 -10 L -12 -6 L -9 2 L -5 0 L -5 10 L 5 10 L 5 0 L 9 2 L 12 -6 L 6 -10 Z"
                className={[
                  side === 'home'
                    ? styles.playerHome
                    : side === 'away'
                      ? styles.playerAway
                      : styles.playerUnknown,
                  selectable ? styles.playerSelectable : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="img"
                aria-label={`Player ${player.playerId}, ${teamLabel}`}
              >
                <title>{`Player ${player.playerId} (${teamLabel})`}</title>
              </path>
              {shirtNumber != null ? (
                <text x="0" y="4" className={styles.shirtNumber} aria-hidden="true">
                  {shirtNumber}
                </text>
              ) : null}
            </g>
          )
        })}

        {/* Ball marker from frame only */}
        {ballSvg ? (
          <g
            transform={`translate(${ballSvg.x}, ${ballSvg.y})`}
            data-testid="ball-marker"
          >
            <ellipse cx="1.5" cy="8" rx="8" ry="2.6" className={styles.ballShadow} />
            <g className={styles.ball} role="img" aria-label="Ball">
              <title>Ball</title>
              <circle r={8} className={styles.ballShell} />
              <path
                d="M 0 -4 L 3 -1 L 2 3 L -2 3 L -3 -1 Z M -3 -1 L -7 -3 M 3 -1 L 7 -3 M 2 3 L 5 6 M -2 3 L -5 6"
                className={styles.ballSeam}
              />
            </g>
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
        {frame == null || (players.length === 0 && !ballSvg) ? (
          <span className={styles.legendNote}>
            {locale === 'ar'
              ? 'لا توجد إحداثيات إطار صالحة لهذه اللحظة'
              : 'No valid frame coordinates for this moment'}
          </span>
        ) : null}
        {omittedFrameMarkers > 0 ? (
          <span className={styles.legendNote} role="note">
            {locale === 'ar'
              ? `تم إخفاء ${omittedFrameMarkers} إحداثيات إطار غير صالحة`
              : `${omittedFrameMarkers} invalid frame coordinate${omittedFrameMarkers === 1 ? '' : 's'} hidden`}
          </span>
        ) : null}
      </figcaption>
    </figure>
  )
}
