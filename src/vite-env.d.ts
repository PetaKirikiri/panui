/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Akomanga shell origin when Pānui is on a separate host (e.g. https://akomanga.vercel.app). */
  readonly VITE_ECOSYSTEM_SHELL_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
