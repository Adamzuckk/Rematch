import { describe, expect, it } from 'vitest'
import { mockMatchService } from './mockMatchService'
import {
  DecisionInsufficientEvidenceError,
  DecisionNotFoundError,
} from './types'

describe('mockMatchService.getDecisionAnalysis', () => {
  it('returns a labelled synthetic fixture for evt-ng-pass-12', async () => {
    const analysis = await mockMatchService.getDecisionAnalysis(
      'm-northgate-riverside-2401',
      'evt-ng-pass-12',
    )
    expect(analysis.provenance).toBe('synthetic')
    expect(analysis.context.mockFixture).toBe(true)
    expect(analysis.alternatives).toEqual([])
    expect(analysis.observed.compositeScore).toBeTruthy()
    expect(analysis.completeness.hasAlignedFrame).toBe(false)
  })

  it('rejects non-candidate events with insufficient evidence', async () => {
    await expect(
      mockMatchService.getDecisionAnalysis(
        'm-northgate-riverside-2401',
        'evt-ng-pressure-41',
      ),
    ).rejects.toBeInstanceOf(DecisionInsufficientEvidenceError)
  })

  it('rejects unknown events with 404-style error', async () => {
    await expect(
      mockMatchService.getDecisionAnalysis(
        'm-northgate-riverside-2401',
        'evt-does-not-exist',
      ),
    ).rejects.toBeInstanceOf(DecisionNotFoundError)
  })

  it('rejects unknown matches', async () => {
    await expect(
      mockMatchService.getDecisionAnalysis('m-missing', 'evt-ng-pass-12'),
    ).rejects.toMatchObject({ code: 'match_not_found' })
  })
})
