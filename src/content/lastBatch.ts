const PREFIX = 'panui:lastBatchIndex'

export function lastBatchStorageKey(bookId: string, chapterId: string): string {
  return `${PREFIX}:${bookId}:${chapterId}`
}

export function readLastBatchIndex(bookId: string, chapterId: string): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(lastBatchStorageKey(bookId, chapterId))
  if (raw === null) return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

export function writeLastBatchIndex(bookId: string, chapterId: string, index: number): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(lastBatchStorageKey(bookId, chapterId), String(index))
}

const STATIC_DRAFT_PREFIX = 'panui:static-draft:'

/** Clears stored chapter content for static routes: drafts and saved page—not the sidebar chapter row or bundled JSON. */
export function clearStaticChapterLocalStorage(bookId: string, chapterId: string): void {
  if (typeof window === 'undefined') return
  const draftPrefix = `${STATIC_DRAFT_PREFIX}${bookId}:${chapterId}:`
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(draftPrefix)) localStorage.removeItem(k)
    }
    localStorage.removeItem(lastBatchStorageKey(bookId, chapterId))
  } catch {
    /* ignore */
  }
}
