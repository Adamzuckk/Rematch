import { useId } from 'react'
import {
  mapPitchPointToSvgClamped,
  PITCH_VIEWBOX,
} from '../../lib/pitch'
import type { PassNetwork } from '../../lib/matchCentre'
import styles from './PassNetworkPitch.module.css'

const { width: W, height: H } = PITCH_VIEWBOX

const MARK = {
  penaltyDepth: 165,
  penaltyWidth: 403.2,
  goalDepth: 55,
  goalWidth: 183.2,
  centerRadius: 91.5,
  penaltySpot: 110,
  cornerRadius: 20,
} as const

export interface PassNetworkPitchProps {
  network: PassNetwork
  label: string
  emptyLabel: string
  teamName?: string
  side?: 'home' | 'away'
}

export function PassNetworkPitch({
  network,
  label,
  emptyLabel,
  teamName,
  side = 'home',
}: PassNetworkPitchProps) {
  const stripePatternId = `pass-net-stripes-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const penaltyY = (H - MARK.penaltyWidth) / 2
  const goalY = (H - MARK.goalWidth) / 2
  const nodeById = new Map(network.nodes.map((n) => [n.playerId, n]))
  const maxTouches = Math.max(1, ...network.nodes.map((n) => n.touches))
  const maxEdge = Math.max(1, ...network.edges.map((e) => e.count), 1)

  return (
    <figure className={styles.root}>
      <figcaption className={styles.caption}>
        {teamName ? (
          <span
            className={side === 'home' ? styles.teamHome : styles.teamAway}
          >
            {teamName}
          </span>
        ) : null}
        <span className={styles.captionText}>{label}</span>
      </figcaption>
      {network.nodes.length === 0 ? (
        <p className={styles.empty}>{emptyLabel}</p>
      ) : (
        <svg
          className={styles.svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={label}
        >
          <defs>
            <pattern
              id={stripePatternId}
              patternUnits="userSpaceOnUse"
              width="80"
              height={H}
            >
              <rect width="40" height={H} className={styles.stripeA} />
              <rect x="40" width="40" height={H} className={styles.stripeB} />
            </pattern>
          </defs>
          <rect width={W} height={H} fill={`url(#${stripePatternId})`} />
          <rect
            x="8"
            y="8"
            width={W - 16}
            height={H - 16}
            className={styles.line}
            fill="none"
          />
          <line x1={W / 2} y1="8" x2={W / 2} y2={H - 8} className={styles.line} />
          <circle
            cx={W / 2}
            cy={H / 2}
            r={MARK.centerRadius}
            className={styles.line}
            fill="none"
          />
          <circle cx={W / 2} cy={H / 2} r="6" className={styles.spot} />
          <rect
            x="8"
            y={penaltyY}
            width={MARK.penaltyDepth}
            height={MARK.penaltyWidth}
            className={styles.line}
            fill="none"
          />
          <rect
            x={W - 8 - MARK.penaltyDepth}
            y={penaltyY}
            width={MARK.penaltyDepth}
            height={MARK.penaltyWidth}
            className={styles.line}
            fill="none"
          />
          <rect
            x="8"
            y={goalY}
            width={MARK.goalDepth}
            height={MARK.goalWidth}
            className={styles.line}
            fill="none"
          />
          <rect
            x={W - 8 - MARK.goalDepth}
            y={goalY}
            width={MARK.goalDepth}
            height={MARK.goalWidth}
            className={styles.line}
            fill="none"
          />
          <circle
            cx={8 + MARK.penaltySpot}
            cy={H / 2}
            r="5"
            className={styles.spot}
          />
          <circle
            cx={W - 8 - MARK.penaltySpot}
            cy={H / 2}
            r="5"
            className={styles.spot}
          />

          {network.edges.map((edge) => {
            const from = nodeById.get(edge.fromId)
            const to = nodeById.get(edge.toId)
            if (!from || !to) return null
            const a = mapPitchPointToSvgClamped(from.position)
            const b = mapPitchPointToSvgClamped(to.position)
            if (!a || !b) return null
            const stroke = 1.5 + (edge.count / maxEdge) * 5
            return (
              <line
                key={`${edge.fromId}-${edge.toId}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={styles.edge}
                strokeWidth={stroke}
              />
            )
          })}

          {network.nodes.map((node) => {
            const svg = mapPitchPointToSvgClamped(node.position)
            if (!svg) return null
            const r = 16 + (node.touches / maxTouches) * 10
            const labelText =
              node.shirtNumber != null ? String(node.shirtNumber) : '·'
            return (
              <g key={node.playerId}>
                <circle
                  cx={svg.x}
                  cy={svg.y}
                  r={r}
                  className={styles.node}
                >
                  <title>{`${node.name} · ${node.touches}`}</title>
                </circle>
                <text
                  x={svg.x}
                  y={svg.y}
                  className={styles.nodeLabel}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {labelText}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </figure>
  )
}
