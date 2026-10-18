import { BrowserRouter } from 'react-router-dom'
import { LocaleProvider } from '../i18n/locale'
import { AppRouter } from './router'

export function App() {
  return (
    <LocaleProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </LocaleProvider>
  )
}
