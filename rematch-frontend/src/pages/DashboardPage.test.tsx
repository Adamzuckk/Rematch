import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { STRINGS } from '../i18n/strings'
import { renderWithProviders } from '../test/render'
import { DashboardPage } from './DashboardPage'

afterEach(() => {
  cleanup()
  window.localStorage.setItem('rematch.locale', 'en')
})

async function waitForCatalogue() {
  await waitFor(() => {
    expect(screen.getByText(/Northgate FC/i)).toBeInTheDocument()
  })
}

describe('DashboardPage', () => {
  it('searches by home team, away team, and competition', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DashboardPage />)
    await waitForCatalogue()

    const search = screen.getByRole('searchbox', {
      name: STRINGS.en.searchLabel,
    })

    await user.clear(search)
    await user.type(search, 'Harbor')
    expect(await screen.findByText(/Harbor Athletic/i)).toBeInTheDocument()
    expect(screen.queryByText(/Northgate FC/i)).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'Milltown')
    expect(await screen.findByText(/Milltown Athletic/i)).toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'Northern Circuit')
    expect(await screen.findByText(/Crestvale Rovers/i)).toBeInTheDocument()
    expect(screen.getByText(/Northern Circuit/i)).toBeInTheDocument()
  })

  it('filters by each match status', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DashboardPage />)
    await waitForCatalogue()

    await user.click(screen.getByRole('button', { name: STRINGS.en.filterLive }))
    expect(await screen.findByText(/Northgate FC/i)).toBeInTheDocument()
    expect(screen.getByText(/Harbor Athletic/i)).toBeInTheDocument()
    expect(screen.getByText(/Westfield Borough/i)).toBeInTheDocument()
    expect(screen.queryByText(/Oakwood Wanderers/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Lakeside Town/i)).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: STRINGS.en.filterFinished }),
    )
    expect(await screen.findByText(/Oakwood Wanderers/i)).toBeInTheDocument()
    expect(screen.getByText(/Crestvale Rovers/i)).toBeInTheDocument()
    expect(screen.queryByText(/Northgate FC/i)).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: STRINGS.en.filterUpcoming }),
    )
    expect(await screen.findByText(/Lakeside Town/i)).toBeInTheDocument()
    expect(screen.queryByText(/Westfield Borough/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Oakwood Wanderers/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: STRINGS.en.filterAll }))
    expect(await screen.findByText(/Northgate FC/i)).toBeInTheDocument()
    expect(screen.getByText(/Lakeside Town/i)).toBeInTheDocument()
  })

  it('shows empty state and clears filters', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DashboardPage />)
    await waitForCatalogue()

    const search = screen.getByRole('searchbox', {
      name: STRINGS.en.searchLabel,
    })
    await user.type(search, 'zzzz-no-match')

    expect(await screen.findByText(STRINGS.en.emptyTitle)).toBeInTheDocument()
    expect(screen.getByText(STRINGS.en.emptyFiltered)).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: STRINGS.en.clearFilters }),
    )
    expect(await screen.findByText(/Northgate FC/i)).toBeInTheDocument()
    expect(search).toHaveValue('')
  })

  it('surfaces synthetic provenance in the UI', async () => {
    renderWithProviders(<DashboardPage />)
    await waitForCatalogue()

    expect(screen.getByText(/rematch-phase2-v1/i)).toBeInTheDocument()
    expect(screen.getByText(/provenance:\s*synthetic/i)).toBeInTheDocument()

    const demoBadges = screen.getAllByText(/Synthetic demo data/i)
    expect(demoBadges.length).toBeGreaterThan(0)
  })

  it('switches dashboard copy between English and Arabic', async () => {
    renderWithProviders(<DashboardPage />)
    await waitForCatalogue()
    expect(
      screen.getByRole('heading', {
        name: `${STRINGS.en.dashboardTitle} ${STRINGS.en.dashboardTitleAccent}`,
      }),
    ).toBeInTheDocument()

    cleanup()
    window.localStorage.setItem('rematch.locale', 'ar')
    renderWithProviders(<DashboardPage />)

    expect(
      await screen.findByRole('heading', {
        name: `${STRINGS.ar.dashboardTitle} ${STRINGS.ar.dashboardTitleAccent}`,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('searchbox', { name: STRINGS.ar.searchLabel }),
    ).toBeInTheDocument()

    const filterGroup = screen.getByRole('group', {
      name: STRINGS.ar.filterByStatus,
    })
    expect(
      within(filterGroup).getByRole('button', { name: STRINGS.ar.filterLive }),
    ).toBeInTheDocument()
  })
})
