import { useContext } from 'react'
import { ReaderViewModeContext } from '../context/readerViewModeContext'

export function useReaderViewMode() {
  const ctx = useContext(ReaderViewModeContext)
  if (!ctx) {
    throw new Error('useReaderViewMode must be used within ReaderViewModeProvider')
  }
  return ctx
}
