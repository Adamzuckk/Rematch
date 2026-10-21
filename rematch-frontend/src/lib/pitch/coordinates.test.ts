import { describe, expect, it } from 'vitest'
import {
  clampPitchPoint,
  mapPitchPointToSvg,
  mapPitchPointToSvgClamped,
  PITCH_VIEWBOX,
} from './coordinates'

describe('mapPitchPointToSvg', () => {
  it('maps bottom-left origin (0,0) to SVG bottom-left', () => {
    expect(mapPitchPointToSvg({ x: 0, y: 0 })).toEqual({
      x: 0,
      y: PITCH_VIEWBOX.height,
    })
  })

  it('maps top-right (100,100) to SVG top-right', () => {
    expect(mapPitchPointToSvg({ x: 100, y: 100 })).toEqual({
      x: PITCH_VIEWBOX.width,
      y: 0,
    })
  })

  it('maps pitch center to SVG center', () => {
    expect(mapPitchPointToSvg({ x: 50, y: 50 })).toEqual({
      x: PITCH_VIEWBOX.width / 2,
      y: PITCH_VIEWBOX.height / 2,
    })
  })

  it('normalizes finite SVG coordinates so equivalent positions are stable', () => {
    expect(mapPitchPointToSvg({ x: 80, y: 30 })).toEqual({
      x: 840,
      y: 476,
    })
  })

  it('returns null for out-of-range coordinates', () => {
    expect(mapPitchPointToSvg({ x: -1, y: 50 })).toBeNull()
    expect(mapPitchPointToSvg({ x: 50, y: 101 })).toBeNull()
    expect(mapPitchPointToSvg({ x: Number.NaN, y: 50 })).toBeNull()
    expect(mapPitchPointToSvg({ x: 50, y: Number.POSITIVE_INFINITY })).toBeNull()
  })
})

describe('clampPitchPoint / mapPitchPointToSvgClamped', () => {
  it('clamps finite out-of-range values into 0–100', () => {
    expect(clampPitchPoint({ x: -5, y: 120 })).toEqual({ x: 0, y: 100 })
    expect(clampPitchPoint({ x: 150, y: -2 })).toEqual({ x: 100, y: 0 })
  })

  it('returns null for non-finite values instead of inventing positions', () => {
    expect(clampPitchPoint({ x: Number.NaN, y: 10 })).toBeNull()
    expect(mapPitchPointToSvgClamped({ x: Number.NaN, y: 10 })).toBeNull()
  })

  it('maps clamped points into the viewBox', () => {
    expect(mapPitchPointToSvgClamped({ x: -10, y: 50 })).toEqual({
      x: 0,
      y: PITCH_VIEWBOX.height / 2,
    })
  })
})
