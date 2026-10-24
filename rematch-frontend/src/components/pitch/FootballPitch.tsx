import { useId, useMemo, type KeyboardEvent, type ReactNode } from 'react'
import type { MatchEvent, MatchFrame, Team } from '../../types'
import type { PitchPoint } from '../../types/coordinates'
import type { SimBallState, SimPlayerState } from '../../lib/matchSimulation'
import {
  getEventGeometry,
  mapPitchPointToSvgClamped,
  PITCH_VIEWBOX,
} from '../../lib/pitch'
import styles from './FootballPitch.module.css'

/** Optional continuous simulation overlay — overrides static frame markers when set. */
export interface PitchSimulationView {
  players: readonly SimPlayerState[]
  ball: SimBallState | null
  /** When false, hide name chips (reduced clutter / reduced motion). */
  showLabels?: boolean
  /** Playback motion mode from the sampler — drives trail emphasis only. */
  motionMode?: 'interpolated' | 'reduced' | 'static'
  /** 0–1 progress within the active event segment. */
  segmentProgress?: number
}

export interface FootballPitchProps {
  homeTeam: Team
  awayTeam: Team
  selectedEvent?: MatchEvent | null
  frame?: MatchFrame | null
  /** Continuous simulation sample; takes precedence over frame markers. */
  simulation?: PitchSimulationView | null
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
  postDepth: 18,
  postThickness: 5,
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

function shortLabel(
  player: SimPlayerState,
  locale: 'en' | 'ar',
): string | null {
  if (player.name) {
    const parts = player.name.trim().split(/\s+/)
    if (parts.length >= 2) {
      const last = parts[parts.length - 1]!
      return last.length > 10 ? `${last.slice(0, 9)}…` : last
    }
    return player.name.length > 12
      ? `${player.name.slice(0, 11)}…`
      : player.name
  }
  if (player.shirtNumber != null) return `#${player.shirtNumber}`
  return locale === 'ar' ? 'لاعب' : 'Player'
}

function shouldShowLabel(
  player: SimPlayerState,
  totalPlayers: number,
  showLabels: boolean,
): boolean {
  if (!showLabels) return false
  if (
    player.role === 'carrier' ||
    player.role === 'receiver' ||
    player.role === 'actor'
  ) {
    return true
  }
  if (totalPlayers > 8) return false
  return player.name != null || player.shirtNumber != null
}

function markerNumber(player: { shirtNumber?: number | null }): string | null {
  return player.shirtNumber != null ? String(player.shirtNumber) : null
}

function eventTypeLabel(type: MatchEvent['type'], locale: 'en' | 'ar'): string {
  if (locale === 'ar') {
    const ar: Partial<Record<MatchEvent['type'], string>> = {
      pass: 'تمريرة',
      shot: 'تسديدة',
      carry: 'حمل',
      tackle: 'قطع',
      foul: 'خطأ',
      yellow_card: 'بطاقة صفراء',
      red_card: 'بطاقة حمراء',
      offside: 'تسلل',
      substitution: 'تبديل',
      counterattack: 'مرتدة',
      reverse_attack: 'هجوم معاكس',
      counter_press: 'ضغط مرتد',
      pressure: 'ضغط',
      possession_change: 'استحواذ',
    }
    return ar[type] ?? type
  }
  return type.replaceAll('_', ' ')
}

function quadraticPassPath(
  start: { x: number; y: number },
  end: { x: number; y: number },
): string {
  const mx = (start.x + end.x) / 2
  const my = (start.y + end.y) / 2
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.hypot(dx, dy) || 1
  // Gentle broadcast-style arc; magnitude tied to real path length.
  const lift = Math.min(48, Math.max(12, len * 0.12))
  const cx = mx - (dy / len) * lift
  const cy = my + (dx / len) * lift
  return `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`
}

function GoalNet({
  side,
  goalMouthY,
}: {
  side: 'left' | 'right'
  goalMouthY: number
}) {
  const mouth = MARK.goalMouth
  const depth = MARK.postDepth
  const x0 = side === 'left' ? 2 : W - 2
  const dir = side === 'left' ? -1 : 1
  const backX = x0 + dir * depth
  const top = goalMouthY
  const bot = goalMouthY + mouth
  const mesh: ReactNode[] = []
  const strands = 6
  for (let i = 1; i < strands; i += 1) {
    const t = i / strands
    const y = top + mouth * t
    mesh.push(
      <line
        key={`h-${side}-${i}`}
        x1={x0}
        y1={y}
        x2={backX}
        y2={y}
        className={styles.goalNet}
      />,
    )
  }
  for (let i = 1; i < 4; i += 1) {
    const t = i / 4
    const x = x0 + dir * depth * t
    mesh.push(
      <line
        key={`v-${side}-${i}`}
        x1={x}
        y1={top}
        x2={x}
        y2={bot}
        className={styles.goalNet}
      />,
    )
  }
  return (
    <g aria-hidden="true">
      <polygon
        className={styles.goalShadow}
        points={
          side === 'left'
            ? `${x0},${bot} ${backX},${bot - 4} ${backX},${top + 4} ${x0},${top}`
            : `${x0},${bot} ${backX},${bot - 4} ${backX},${top + 4} ${x0},${top}`
        }
        opacity={0.35}
      />
      <path
        className={styles.goalNetFill}
        d={`M ${x0} ${top} L ${backX} ${top + 3} L ${backX} ${bot - 3} L ${x0} ${bot} Z`}
      />
      {mesh}
      {/* Posts + crossbar */}
      <rect
        x={side === 'left' ? x0 - MARK.postThickness : x0}
        y={top - 2}
        width={MARK.postThickness}
        height={mouth + 4}
        className={styles.goalPost}
        rx={1}
      />
      <rect
        x={side === 'left' ? backX : x0}
        y={top - 2}
        width={Math.abs(backX - x0)}
        height={MARK.postThickness}
        className={styles.goalPost}
        rx={1}
      />
      <rect
        x={side === 'left' ? backX - 2 : backX}
        y={top}
        width={MARK.postThickness}
        height={mouth}
        className={styles.goalPost}
        rx={1}
      />
    </g>
  )
}

function EventEffects({
  event,
  locationSvg,
  pathStart,
  pathEnd,
}: {
  event: MatchEvent
  locationSvg: { x: number; y: number } | null
  pathStart: { x: number; y: number } | null
  pathEnd: { x: number; y: number } | null
}) {
  const type = event.type

  if (
    (type === 'pass' ||
      type === 'carry' ||
      type === 'counterattack' ||
      type === 'reverse_attack') &&
    pathStart &&
    pathEnd
  ) {
    const d = quadraticPassPath(pathStart, pathEnd)
    const pathClass =
      type === 'carry'
        ? `${styles.eventPath} ${styles.eventPathCarry}`
        : type === 'counterattack' || type === 'reverse_attack'
          ? `${styles.eventPath} ${styles.eventPathCounter}`
          : styles.eventPath
    const midX = (pathStart.x + pathEnd.x) / 2
    const midY = (pathStart.y + pathEnd.y) / 2
    const angle =
      (Math.atan2(pathEnd.y - pathStart.y, pathEnd.x - pathStart.x) * 180) /
      Math.PI
    return (
      <g>
        <path
          key={`event-path-${event.id}-${pathStart.x}-${pathStart.y}-${pathEnd.x}-${pathEnd.y}`}
          d={d}
          className={pathClass}
          data-testid="event-path"
        />
        {(type === 'counterattack' || type === 'reverse_attack') && (
          <polygon
            className={styles.counterChevron}
            transform={`translate(${midX}, ${midY}) rotate(${angle})`}
            points="10,0 -8,-7 -8,7"
          />
        )}
      </g>
    )
  }

  if ((type === 'tackle' || type === 'foul') && locationSvg) {
    return (
      <g
        transform={`translate(${locationSvg.x}, ${locationSvg.y})`}
        data-testid="event-location"
      >
        <circle
          r={22}
          className={type === 'tackle' ? styles.tackleRing : styles.foulFlash}
        />
        <circle r={8} className={styles.eventMarker} />
        <title>{`Selected ${type} location`}</title>
      </g>
    )
  }

  if ((type === 'pressure' || type === 'counter_press') && locationSvg) {
    return (
      <g
        transform={`translate(${locationSvg.x}, ${locationSvg.y})`}
        data-testid="event-location"
      >
        <circle r={28} className={styles.pressureRing} />
        <circle r={7} className={styles.eventMarker} />
        <title>{`Selected ${type} location`}</title>
      </g>
    )
  }

  if ((type === 'yellow_card' || type === 'red_card') && locationSvg) {
    return (
      <g
        transform={`translate(${locationSvg.x}, ${locationSvg.y})`}
        className={styles.cardBadge}
        data-testid="event-location"
      >
        <circle r={16} className={styles.foulFlash} />
        <rect
          x={-7}
          y={-10}
          width={14}
          height={20}
          rx={2}
          className={
            type === 'yellow_card' ? styles.cardYellow : styles.cardRed
          }
        />
        <title>{`Selected ${type} location`}</title>
      </g>
    )
  }

  if (type === 'offside' && locationSvg) {
    return (
      <g data-testid="event-location">
        <line
          x1={locationSvg.x}
          y1={4}
          x2={locationSvg.x}
          y2={H - 4}
          className={styles.offsideLine}
        />
        <circle
          cx={locationSvg.x}
          cy={locationSvg.y}
          r={9}
          className={styles.eventMarker}
        />
        <title>{`Selected ${type} location`}</title>
      </g>
    )
  }

  if (type === 'substitution' && locationSvg) {
    return (
      <g
        transform={`translate(${locationSvg.x}, ${locationSvg.y})`}
        data-testid="event-location"
      >
        <path
          d="M -14 6 L -14 -6 L -4 -6"
          className={`${styles.subArrow} ${styles.subArrowOut}`}
        />
        <path d="M 14 -6 L 14 6 L 4 6" className={styles.subArrow} />
        <circle r={6} className={styles.eventMarker} />
        <title>{`Selected ${type} location`}</title>
      </g>
    )
  }

  if (type === 'shot' && locationSvg) {
    return (
      <g
        transform={`translate(${locationSvg.x}, ${locationSvg.y})`}
        data-testid="event-location"
      >
        <circle
          r={20}
          className={
            event.outcome === 'goal' ? styles.goalBurst : styles.shotBurst
          }
        />
        <circle r={7} className={styles.eventMarker} />
        <title>{`Selected ${type} location`}</title>
      </g>
    )
  }

  return null
}

export function FootballPitch({
  homeTeam,
  awayTeam,
  selectedEvent = null,
  frame = null,
  simulation = null,
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
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const ids = useMemo(
    () => ({
      stripes: `pitch-stripes-${rawId}`,
      turfGrad: `pitch-turf-grad-${rawId}`,
      turfNoise: `pitch-noise-${rawId}`,
      light: `pitch-light-${rawId}`,
      shadow: `pitch-shadow-${rawId}`,
      softShadow: `pitch-soft-shadow-${rawId}`,
    }),
    [rawId],
  )

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

  const simPlayers = simulation?.players ?? null
  const showLabels = simulation?.showLabels !== false
  const framePlayers = frame?.players ?? []
  const ballSvg = simulation
    ? simulation.ball
      ? mapPitchPointToSvgClamped(simulation.ball.position)
      : null
    : frame?.ball
      ? mapPitchPointToSvgClamped(frame.ball.position)
      : null

  const ballTrail =
    simulation?.motionMode === 'interpolated' &&
    simulation.ball &&
    pathStart &&
    pathEnd &&
    selectedEvent &&
    (selectedEvent.type === 'pass' ||
      selectedEvent.type === 'carry' ||
      selectedEvent.type === 'counterattack' ||
      selectedEvent.type === 'reverse_attack')
      ? { start: pathStart, end: ballSvg ?? pathEnd }
      : null

  const penaltyY = (H - MARK.penaltyWidth) / 2
  const goalY = (H - MARK.goalWidth) / 2
  const goalMouthY = (H - MARK.goalMouth) / 2
  const hasPlayerLayer =
    (simPlayers != null && simPlayers.length > 0) ||
    (simPlayers == null && framePlayers.length > 0)

  const renderPlayer = (
    player: {
      playerId: string
      teamId: string
      position: PitchPoint
      name?: string | null
      shirtNumber?: number | null
      role?: SimPlayerState['role']
      source?: SimPlayerState['source']
      generic?: boolean
    },
    opts: { sim: boolean; total: number },
  ) => {
    const svgPoint = mapPitchPointToSvgClamped(player.position)
    if (!svgPoint) return null
    const side = teamSide(player.teamId, homeTeam.id, awayTeam.id)
    const teamLabel =
      side === 'home'
        ? homeTeam.name
        : side === 'away'
          ? awayTeam.name
          : 'Unknown team'
    const displayName = player.name ?? null
    const accessibleName = displayName
      ? `${displayName}, ${teamLabel}`
      : player.generic
        ? locale === 'ar'
          ? `لاعب غير مسمّى، ${teamLabel}`
          : `Unnamed player, ${teamLabel}`
        : `Player ${player.playerId}, ${teamLabel}`
    const selectable = selectablePlayerIds.includes(player.playerId)
    const role = player.role
    const highlighted =
      role === 'carrier' || role === 'receiver' || role === 'actor'
    const labelText =
      opts.sim &&
      shouldShowLabel(
        player as SimPlayerState,
        opts.total,
        showLabels,
      )
        ? shortLabel(player as SimPlayerState, locale)
        : null
    const labelDy =
      ballSvg &&
      Math.hypot(svgPoint.x - ballSvg.x, svgPoint.y - ballSvg.y) < 36
        ? -30
        : -20
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
    const bodyClass = [
      styles.playerBody,
      side === 'home'
        ? styles.playerHome
        : side === 'away'
          ? styles.playerAway
          : styles.playerUnknown,
    ].join(' ')

    return (
      <g
        key={`${player.playerId}-${player.teamId}`}
        className={[
          styles.playerNode,
          selectable ? styles.playerSelectable : '',
          selectedPlayerId === player.playerId ? styles.playerSelected : '',
          player.generic ? styles.playerGeneric : '',
        ]
          .filter(Boolean)
          .join(' ')}
        transform={`translate(${svgPoint.x}, ${svgPoint.y})`}
        data-testid="player-marker"
        data-team={side}
        data-role={role}
        data-source={player.source}
        data-generic={player.generic || undefined}
        data-selectable={selectable || undefined}
        {...markerProps}
      >
        <ellipse
          cx={0}
          cy={11}
          rx={highlighted ? 12 : 10}
          ry={4}
          className={styles.playerShadow}
          aria-hidden="true"
        />
        {highlighted && role === 'carrier' ? (
          <circle r={18} className={styles.roleHaloCarrier} aria-hidden="true" />
        ) : null}
        {highlighted && role === 'receiver' ? (
          <circle
            r={18}
            className={styles.roleHaloReceiver}
            aria-hidden="true"
          />
        ) : null}
        {highlighted && role === 'actor' ? (
          <circle r={17} className={styles.roleHaloActor} aria-hidden="true" />
        ) : null}
        {/* Kit silhouette */}
        <rect
          x={-9}
          y={-11}
          width={18}
          height={20}
          rx={5}
          className={bodyClass}
          role="img"
          aria-label={accessibleName}
        >
          <title>{accessibleName}</title>
        </rect>
        <rect
          x={-9}
          y={-11}
          width={4}
          height={12}
          rx={1.5}
          className={styles.playerSleeve}
          aria-hidden="true"
        />
        <rect
          x={5}
          y={-11}
          width={4}
          height={12}
          rx={1.5}
          className={styles.playerSleeve}
          aria-hidden="true"
        />
        <circle cx={0} cy={-14} r={4.2} className={bodyClass} aria-hidden="true" />
        {markerNumber(player) ? (
          <text
            textAnchor="middle"
            dominantBaseline="central"
            y={1}
            className={styles.markerNumber}
            aria-hidden="true"
          >
            {markerNumber(player)}
          </text>
        ) : null}
        {labelText ? (
          <g
            transform={`translate(0, ${labelDy})`}
            data-testid="player-label"
            pointerEvents="none"
          >
            <rect
              x={-30}
              y={-9}
              width={60}
              height={15}
              rx={3}
              className={
                side === 'home'
                  ? styles.labelBgHome
                  : side === 'away'
                    ? styles.labelBgAway
                    : styles.labelBgUnknown
              }
            />
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              y={-0.5}
              className={styles.labelText}
              direction={locale === 'ar' ? 'rtl' : 'ltr'}
            >
              {labelText}
            </text>
          </g>
        ) : null}
      </g>
    )
  }

  return (
    <figure
      className={[styles.root, className ?? ''].filter(Boolean).join(' ')}
    >
      <div className={styles.stage}>
        <div className={styles.floodlight} aria-hidden="true" />
        <svg
          className={styles.svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={label}
          preserveAspectRatio="xMidYMid meet"
        >
          <title>{label}</title>
          <defs>
            <linearGradient id={ids.turfGrad} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3d8f48" />
              <stop offset="45%" stopColor="#2f7538" />
              <stop offset="100%" stopColor="#24632d" />
            </linearGradient>
            <pattern
              id={ids.stripes}
              width="78"
              height={H}
              patternUnits="userSpaceOnUse"
            >
              <rect width="39" height={H} className={styles.stripeA} />
              <rect x="39" width="39" height={H} className={styles.stripeB} />
            </pattern>
            <filter id={ids.turfNoise} x="0%" y="0%" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.85"
                numOctaves="3"
                stitchTiles="stitch"
                result="noise"
              />
              <feColorMatrix
                type="matrix"
                values="0 0 0 0 0.12
                        0 0 0 0 0.28
                        0 0 0 0 0.14
                        0 0 0 0.22 0"
                in="noise"
                result="tint"
              />
              <feBlend in="SourceGraphic" in2="tint" mode="soft-light" />
            </filter>
            <radialGradient id={ids.light} cx="50%" cy="18%" r="75%">
              <stop offset="0%" stopColor="rgba(255,252,235,0.22)" />
              <stop offset="45%" stopColor="rgba(255,252,235,0.05)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.28)" />
            </radialGradient>
            <filter
              id={ids.softShadow}
              x="-40%"
              y="-40%"
              width="180%"
              height="180%"
            >
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="2"
                floodColor="#000"
                floodOpacity="0.35"
              />
            </filter>
          </defs>

          {/* Stadium apron */}
          <rect width={W} height={H} className={styles.apron} />

          {/* Turf plate */}
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            fill={`url(#${ids.turfGrad})`}
          />
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            fill={`url(#${ids.stripes})`}
            opacity={0.92}
          />
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            filter={`url(#${ids.turfNoise})`}
            className={styles.turfNoise}
            fill={`url(#${ids.stripes})`}
          />
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            fill={`url(#${ids.light})`}
            pointerEvents="none"
          />

          {/* Touchline depth */}
          <rect
            x={2}
            y={2}
            width={W - 4}
            height={H - 4}
            className={styles.touchlineShadow}
            rx={2}
          />

          {/* Boundary */}
          <rect
            x={2}
            y={2}
            width={W - 4}
            height={H - 4}
            className={styles.line}
          />

          {/* Halfway line */}
          <line
            x1={W / 2}
            y1={2}
            x2={W / 2}
            y2={H - 2}
            className={styles.line}
          />

          {/* Center circle + spot */}
          <circle
            cx={W / 2}
            cy={H / 2}
            r={MARK.centerRadius}
            className={styles.line}
          />
          <circle cx={W / 2} cy={H / 2} r={3.5} className={styles.spot} />

          {/* Left penalty / goal areas */}
          <rect
            x={2}
            y={penaltyY}
            width={MARK.penaltyDepth}
            height={MARK.penaltyWidth}
            className={styles.line}
          />
          <rect
            x={2}
            y={goalY}
            width={MARK.goalDepth}
            height={MARK.goalWidth}
            className={styles.line}
          />
          <circle
            cx={MARK.penaltySpot}
            cy={H / 2}
            r={3.5}
            className={styles.spot}
          />
          <path
            d={`M ${MARK.penaltyDepth} ${H / 2 - MARK.centerRadius}
                A ${MARK.centerRadius} ${MARK.centerRadius} 0 0 1 ${MARK.penaltyDepth} ${H / 2 + MARK.centerRadius}`}
            className={styles.lineSoft}
          />

          {/* Right penalty / goal areas */}
          <rect
            x={W - 2 - MARK.penaltyDepth}
            y={penaltyY}
            width={MARK.penaltyDepth}
            height={MARK.penaltyWidth}
            className={styles.line}
          />
          <rect
            x={W - 2 - MARK.goalDepth}
            y={goalY}
            width={MARK.goalDepth}
            height={MARK.goalWidth}
            className={styles.line}
          />
          <circle
            cx={W - MARK.penaltySpot}
            cy={H / 2}
            r={3.5}
            className={styles.spot}
          />
          <path
            d={`M ${W - MARK.penaltyDepth} ${H / 2 - MARK.centerRadius}
                A ${MARK.centerRadius} ${MARK.centerRadius} 0 0 0 ${W - MARK.penaltyDepth} ${H / 2 + MARK.centerRadius}`}
            className={styles.lineSoft}
          />

          {/* Dimensional goals + nets */}
          <GoalNet side="left" goalMouthY={goalMouthY} />
          <GoalNet side="right" goalMouthY={goalMouthY} />

          {/* Corner arcs */}
          <path
            d={`M 2 ${2 + MARK.cornerRadius} A ${MARK.cornerRadius} ${MARK.cornerRadius} 0 0 0 ${2 + MARK.cornerRadius} 2`}
            className={styles.line}
          />
          <path
            d={`M ${W - 2 - MARK.cornerRadius} 2 A ${MARK.cornerRadius} ${MARK.cornerRadius} 0 0 0 ${W - 2} ${2 + MARK.cornerRadius}`}
            className={styles.line}
          />
          <path
            d={`M 2 ${H - 2 - MARK.cornerRadius} A ${MARK.cornerRadius} ${MARK.cornerRadius} 0 0 1 ${2 + MARK.cornerRadius} ${H - 2}`}
            className={styles.line}
          />
          <path
            d={`M ${W - 2} ${H - 2 - MARK.cornerRadius} A ${MARK.cornerRadius} ${MARK.cornerRadius} 0 0 1 ${W - 2 - MARK.cornerRadius} ${H - 2}`}
            className={styles.line}
          />

          {/* Event FX from real selected-event geometry only */}
          {selectedEvent ? (
            <EventEffects
              event={selectedEvent}
              locationSvg={locationSvg}
              pathStart={pathStart}
              pathEnd={pathEnd}
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

          {/* Location halo for path-based events (specialized FX handle other types) */}
          {locationSvg &&
          selectedEvent &&
          (selectedEvent.type === 'pass' ||
            selectedEvent.type === 'carry' ||
            selectedEvent.type === 'counterattack' ||
            selectedEvent.type === 'reverse_attack') ? (
            <g
              key={`event-location-${selectedEvent.id}-${locationSvg.x}-${locationSvg.y}`}
              transform={`translate(${locationSvg.x}, ${locationSvg.y})`}
              data-testid="event-location"
            >
              <circle r={15} className={styles.eventHalo} />
              <circle r={6.5} className={styles.eventMarker} />
              <title>{`Selected ${selectedEvent.type} location`}</title>
            </g>
          ) : null}

          {/* Players */}
          {simPlayers
            ? simPlayers.map((player) =>
                renderPlayer(player, { sim: true, total: simPlayers.length }),
              )
            : framePlayers.map((player) =>
                renderPlayer(
                  {
                    playerId: player.playerId,
                    teamId: player.teamId,
                    position: player.position,
                  },
                  { sim: false, total: framePlayers.length },
                ),
              )}

          {/* Ball trail from verified event path during interpolated playback */}
          {ballTrail ? (
            <line
              x1={ballTrail.start.x}
              y1={ballTrail.start.y}
              x2={ballTrail.end.x}
              y2={ballTrail.end.y}
              className={`${styles.ballTrail} ${styles.ballTrailActive}`}
              aria-hidden="true"
            />
          ) : null}

          {/* Ball */}
          {ballSvg ? (
            <g
              className={styles.ballGroup}
              transform={`translate(${ballSvg.x}, ${ballSvg.y})`}
              data-testid="ball-marker"
              filter={`url(#${ids.softShadow})`}
            >
              <ellipse
                cx={1}
                cy={5}
                rx={7}
                ry={3}
                className={styles.ballShadow}
                aria-hidden="true"
              />
              <circle
                r={7.5}
                className={styles.ball}
                role="img"
                aria-label="Ball"
              >
                <title>Ball</title>
              </circle>
              <path
                d="M -2.5 -4.5 L 0 -1.5 L 2.5 -4.5 M 0 -1.5 L 0 2.5 M -3.5 1.5 L 0 2.5 L 3.5 1.5"
                className={styles.ballPanel}
                strokeWidth={1.2}
                stroke="#151815"
                fill="none"
                aria-hidden="true"
              />
              <circle
                cx={-2.2}
                cy={-2.4}
                r={1.6}
                className={styles.ballHighlight}
                aria-hidden="true"
              />
            </g>
          ) : null}
        </svg>
        <div className={styles.vignette} aria-hidden="true" />
      </div>

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
        {selectedEvent ? (
          <span className={styles.eventChip}>
            {eventTypeLabel(selectedEvent.type, locale)}
            {selectedEvent.minute != null
              ? ` · ${Math.floor(selectedEvent.minute)}'`
              : ''}
          </span>
        ) : null}
        {simulation ? (
          <span className={styles.legendNote} data-testid="simulation-legend">
            {locale === 'ar'
              ? 'محاكاة من بيانات ري ماتش — ليست تتبّعًا حيًا'
              : 'Simulated from Rematch data — not live tracking'}
          </span>
        ) : !hasPlayerLayer ? (
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
