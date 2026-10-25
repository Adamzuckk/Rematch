/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MATCH_DATA_SOURCE?: 'mock' | 'api'
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ORCHESTRATOR_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
