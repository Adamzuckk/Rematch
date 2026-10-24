import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { STRINGS } from '../i18n/strings'
import { matchService } from '../services/matches'
import { renderWithProviders } from '../test/render'
import { MetricsPage } from './MetricsPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.setItem('rematch.locale', 'en')
})

describe('MetricsPage', () => {
  it('shows a loading state while telemetry is being fetched', () => {
    vi.spyOn(matchService, 'getSystemMetrics').mockReturnValue(new Promise(() => {}))
    renderWithProviders(<MetricsPage />, { initialEntries: ['/metrics'] })
    expect(screen.getByRole('status')).toHaveTextContent(STRINGS.en.metricsLoading)
  })

  it('does not present static synthetic fixtures as operational telemetry', async () => {
    renderWithProviders(<MetricsPage />, { initialEntries: ['/metrics'] })
    expect(await screen.findByText(STRINGS.en.metricsMockTitle)).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.metricsMockBody)).toBeInTheDocument()
  })

  it('renders the metrics controls in Arabic RTL mode', async () => {
    window.localStorage.setItem('rematch.locale', 'ar')
    renderWithProviders(<MetricsPage />, { initialEntries: ['/metrics'] })
    expect(await screen.findByText(STRINGS.ar.metricsMockTitle)).toBeInTheDocument()
    expect(screen.getByText(STRINGS.ar.metricsRangeLabel)).toBeInTheDocument()
    expect(document.documentElement.dir).toBe('rtl')
  })

  it('renders measured API telemetry with its source and coverage scope', async () => {
    vi.spyOn(matchService, 'getSystemMetrics').mockResolvedValue({
      generatedAt: '2026-10-22T10:00:00Z',
      range: '7d',
      operation: 'all',
      source: 'Stored ReMatch operational telemetry.',
      operations: {
        attempts: 3, succeeded: 2, failed: 1, successRatePercent: 66.7,
        averageLatencyMs: 9, p95LatencyMs: 15,
      },
      verification: {
        checked: 4, verified: 2, partiallySupported: 1, unsupported: 1,
      },
      fallbackUsage: { available: false, count: null, reason: 'No fallback path.' },
      catalogueCoverage: {
        source: 'Current catalogue (synthetic data)', provenance: 'synthetic', totalEvents: 10,
        eligibleEvents: 6, coveragePercent: 60, description: 'Eligibility only.',
      },
    })
    renderWithProviders(<MetricsPage />, { initialEntries: ['/metrics'] })
    expect(await screen.findByText(STRINGS.en.metricsTelemetrySource)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('6 / 10')).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.metricsUnavailable)).toBeInTheDocument()
  })

  it('shows an API error and retries without falling back to static metrics', async () => {
    const user = userEvent.setup()
    const getSystemMetrics = vi
      .spyOn(matchService, 'getSystemMetrics')
      .mockRejectedValueOnce(new Error('telemetry offline'))
      .mockResolvedValueOnce(null)

    renderWithProviders(<MetricsPage />, { initialEntries: ['/metrics'] })
    expect(await screen.findByText(STRINGS.en.metricsLoadError)).toBeInTheDocument()
    expect(screen.getByText('telemetry offline')).toBeInTheDocument()
    expect(screen.queryByText(STRINGS.en.metricsLoading)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: STRINGS.en.metricsRetry }))
    expect(await screen.findByText(STRINGS.en.metricsMockTitle)).toBeInTheDocument()
    expect(getSystemMetrics).toHaveBeenCalledTimes(2)
  })
})
