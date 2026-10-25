import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { STRINGS } from '../i18n/strings'
import { renderWithProviders } from '../test/render'
import { TableStatsPage } from './TableStatsPage'

afterEach(() => {
  cleanup()
})

describe('TableStatsPage', () => {
  it('renders standings from finished mock fixtures and switches to player stats', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TableStatsPage />)

    expect(
      await screen.findByRole('heading', { name: STRINGS.en.tableStatsTitle }),
    ).toBeInTheDocument()

    const tableTab = screen.getByRole('tab', {
      name: STRINGS.en.tableStatsTabTable,
    })
    const playersTab = screen.getByRole('tab', {
      name: STRINGS.en.tableStatsTabPlayerStats,
    })
    expect(tableTab).toHaveAttribute('aria-selected', 'true')

    expect(await screen.findByText('Oakwood Wanderers')).toBeInTheDocument()
    expect(screen.getByText('Crestvale Rovers')).toBeInTheDocument()
    expect(screen.queryByText('Lakeside Town')).not.toBeInTheDocument()

    const legend = screen.getByLabelText(STRINGS.en.tableStatsLegendTitle)
    expect(within(legend).getByText(/Matches Played/i)).toBeInTheDocument()

    await user.click(playersTab)
    expect(playersTab).toHaveAttribute('aria-selected', 'true')
    expect(tableTab).toHaveAttribute('aria-selected', 'false')

    expect(
      screen.getByRole('combobox', { name: STRINGS.en.tableStatsMetricLabel }),
    ).toHaveValue('goals')

    await user.selectOptions(
      screen.getByRole('combobox', { name: STRINGS.en.tableStatsMetricLabel }),
      'xg',
    )
    expect(
      await screen.findByText(STRINGS.en.tableStatsUnavailableTitle),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: STRINGS.en.tableStatsReset }),
    )
    expect(
      screen.getByRole('combobox', { name: STRINGS.en.tableStatsMetricLabel }),
    ).toHaveValue('goals')
  })
})
