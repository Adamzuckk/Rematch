import { createContext } from 'react'
import type { LocaleCode, MessageKey } from './strings'

export interface LocaleContextValue {
  locale: LocaleCode
  dir: 'ltr' | 'rtl'
  setLocale: (locale: LocaleCode) => void
  t: (key: MessageKey) => string
}

export const LocaleContext = createContext<LocaleContextValue | null>(null)
