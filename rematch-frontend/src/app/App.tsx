import { BrowserRouter } from 'react-router-dom'
import { LocaleProvider } from '../i18n/locale'
import { PersonaProvider } from '../context/PersonaContext'
import { AppRouter } from './router'

export function App() {
  return (
    <LocaleProvider>
      <PersonaProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </PersonaProvider>
    </LocaleProvider>
  )
}
