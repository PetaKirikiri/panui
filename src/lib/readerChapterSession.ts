/** Tracks which chapter number the user last viewed on the Supabase reader (for sidebar actions). */

export function setReaderChapterSession(titleId: string, versionId: string, chapterNumber: number): void {
  try {
    sessionStorage.setItem(`panui:readerChapter:${titleId}:${versionId}`, String(chapterNumber))
  } catch {
    /* ignore */
  }
}

export function getReaderChapterSession(titleId: string, versionId: string): number | null {
  try {
    const v = sessionStorage.getItem(`panui:readerChapter:${titleId}:${versionId}`)
    if (v == null) return null
    const n = Number.parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}
