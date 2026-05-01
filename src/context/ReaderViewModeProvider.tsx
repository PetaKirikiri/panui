import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  ReaderViewModeContext,
  type ReaderViewMode,
  type ReaderViewModeCtx,
} from './readerViewModeContext'

const STORAGE_KEY = 'panui:reader-view-mode'

function readStoredMode(): ReaderViewMode {
  if (typeof window === 'undefined') return 'split'
  const v = sessionStorage.getItem(STORAGE_KEY)
  if (v === 'mi' || v === 'en' || v === 'split') return v
  return 'split'
}

export function ReaderViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ReaderViewMode>(readStoredMode)

  const setMode = useCallback((m: ReaderViewMode) => {
    setModeState(m)
    try {
      sessionStorage.setItem(STORAGE_KEY, m)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo<ReaderViewModeCtx>(() => ({ mode, setMode }), [mode, setMode])

  return (
    <ReaderViewModeContext.Provider value={value}>{children}</ReaderViewModeContext.Provider>
  )
}
