import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { PersonaProvider } from '../context/PersonaContext'
import { LocaleProvider } from '../i18n/locale'

interface ProvidersProps {
  children: ReactNode
  initialEntries?: string[]
}

function Providers({ children, initialEntries = ['/dashboard'] }: ProvidersProps) {
  return (
    <LocaleProvider>
      <PersonaProvider>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </PersonaProvider>
    </LocaleProvider>
  )
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { initialEntries?: string[] },
) {
  const { initialEntries, ...renderOptions } = options ?? {}
  return render(ui, {
    wrapper: ({ children }) => (
      <Providers initialEntries={initialEntries}>{children}</Providers>
    ),
    ...renderOptions,
  })
}
