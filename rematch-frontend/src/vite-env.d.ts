/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MATCH_DATA_SOURCE?: 'mock' | 'api'
  readonly VITE_API_BASE_URL?: string
  /** Optional; sent as Authorization Bearer when calling a protected API. */
  readonly VITE_API_BEARER_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
