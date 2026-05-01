/** One saved reading spot per chapter: batch (page) index + chunk row index. */
export type ChapterBookmark = {
  batchIndex: number
  chunkIndex: number
}

/** Passed into the reader so each chunk row can set the sidebar jump target for this chapter. */
export type ChapterBookmarkScope =
  | { kind: 'static'; bookId: string; chapterId: string; batchIndex: number }
  | {
      kind: 'supabase'
      titleId: number
      versionId: number
      chapterNumber: number
      batchIndex: number
    }

const STATIC_PREFIX = 'panui:chapter-bookmark:static'
const SUPABASE_PREFIX = 'panui:chapter-bookmark:supabase'

function parseBookmark(raw: string | null): ChapterBookmark | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { batchIndex?: unknown; chunkIndex?: unknown }
    const b =
      typeof v.batchIndex === 'number' ? v.batchIndex : Number.parseInt(String(v.batchIndex), 10)
    const c =
      typeof v.chunkIndex === 'number' ? v.chunkIndex : Number.parseInt(String(v.chunkIndex), 10)
    if (!Number.isInteger(b) || b < 0 || !Number.isInteger(c) || c < 0) return null
    return { batchIndex: b, chunkIndex: c }
  } catch {
    return null
  }
}

export function readStaticChapterBookmark(
  bookId: string,
  chapterId: string,
): ChapterBookmark | null {
  if (typeof window === 'undefined') return null
  const key = `${STATIC_PREFIX}:${bookId}:${chapterId}`
  return parseBookmark(window.localStorage.getItem(key))
}

export function writeStaticChapterBookmark(
  bookId: string,
  chapterId: string,
  batchIndex: number,
  chunkIndex: number,
): void {
  if (typeof window === 'undefined') return
  const key = `${STATIC_PREFIX}:${bookId}:${chapterId}`
  try {
    window.localStorage.setItem(key, JSON.stringify({ batchIndex, chunkIndex }))
    window.dispatchEvent(new CustomEvent('panui-chapter-bookmark-changed'))
  } catch {
    /* ignore */
  }
}

export function readSupabaseChapterBookmark(
  titleId: number,
  versionId: number,
  chapterNumber: number,
): ChapterBookmark | null {
  if (typeof window === 'undefined') return null
  const key = `${SUPABASE_PREFIX}:${titleId}:${versionId}:${chapterNumber}`
  return parseBookmark(window.localStorage.getItem(key))
}

export function writeSupabaseChapterBookmark(
  titleId: number,
  versionId: number,
  chapterNumber: number,
  batchIndex: number,
  chunkIndex: number,
): void {
  if (typeof window === 'undefined') return
  const key = `${SUPABASE_PREFIX}:${titleId}:${versionId}:${chapterNumber}`
  try {
    window.localStorage.setItem(key, JSON.stringify({ batchIndex, chunkIndex }))
    window.dispatchEvent(new CustomEvent('panui-chapter-bookmark-changed'))
  } catch {
    /* ignore */
  }
}
