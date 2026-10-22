import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { PersonaPrefs, ViewMode } from './personaTypes'

export type { PersonaPrefs, ViewMode } from './personaTypes'

type PersonaContextValue = PersonaPrefs & {
  setMode: (mode: ViewMode) => void
  setFavoriteTeamId: (id: string | null) => void
  setFavoritePlayerId: (id: string | null) => void
  setPlayerFocusId: (id: string | null) => void
}

const STORAGE_KEY = 'rematch.persona.v1'

const defaultPrefs: PersonaPrefs = {
  mode: 'fan',
  favoriteTeamId: null,
  favoritePlayerId: null,
  playerFocusId: null,
}

function loadPrefs(): PersonaPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultPrefs
    const parsed = JSON.parse(raw) as Partial<PersonaPrefs>
    return {
      mode: parsed.mode === 'analyst' ? 'analyst' : 'fan',
      favoriteTeamId: parsed.favoriteTeamId ?? null,
      favoritePlayerId: parsed.favoritePlayerId ?? null,
      playerFocusId: parsed.playerFocusId ?? null,
    }
  } catch {
    return defaultPrefs
  }
}

const PersonaContext = createContext<PersonaContextValue | null>(null)

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<PersonaPrefs>(() => loadPrefs())

  const persist = useCallback((next: PersonaPrefs) => {
    setPrefs(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore quota */
    }
  }, [])

  const value = useMemo<PersonaContextValue>(
    () => ({
      ...prefs,
      setMode: (mode) => persist({ ...prefs, mode }),
      setFavoriteTeamId: (favoriteTeamId) => persist({ ...prefs, favoriteTeamId }),
      setFavoritePlayerId: (favoritePlayerId) =>
        persist({ ...prefs, favoritePlayerId }),
      setPlayerFocusId: (playerFocusId) => persist({ ...prefs, playerFocusId }),
    }),
    [prefs, persist],
  )

  return (
    <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>
  )
}

export function usePersona(): PersonaContextValue {
  const ctx = useContext(PersonaContext)
  if (!ctx) {
    throw new Error('usePersona must be used within PersonaProvider')
  }
  return ctx
}
