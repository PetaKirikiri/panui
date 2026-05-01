import { createContext } from 'react'

export type ReaderViewMode = 'mi' | 'en' | 'split'

export type ReaderViewModeCtx = {
  mode: ReaderViewMode
  setMode: (m: ReaderViewMode) => void
}

export const ReaderViewModeContext = createContext<ReaderViewModeCtx | null>(null)
