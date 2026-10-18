import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LocaleContext } from './LocaleContext'
import { STRINGS, type LocaleCode, type MessageKey } from './strings'

function readStoredLocale(): LocaleCode {
  try {
    const stored = localStorage.getItem('rematch.locale')
    if (stored === 'en' || stored === 'ar') return stored
  } catch {
    /* ignore */
  }
  return 'en'
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(readStoredLocale)
  const dir: 'ltr' | 'rtl' = locale === 'ar' ? 'rtl' : 'ltr'

  const setLocale = useCallback((next: LocaleCode) => {
    setLocaleState(next)
    try {
      localStorage.setItem('rematch.locale', next)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = dir
  }, [locale, dir])

  const t = useCallback(
    (key: MessageKey) => STRINGS[locale][key],
    [locale],
  )

  const value = useMemo(
    () => ({ locale, dir, setLocale, t }),
    [locale, dir, setLocale, t],
  )

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  )
}
