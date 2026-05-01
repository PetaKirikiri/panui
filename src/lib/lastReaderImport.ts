const STORAGE_KEY = 'panui:lastReaderImport'

export type LastReaderImport = {
  titleId: number
  versionId: number
  chapterNumber: number
  titleName: string | null
  savedAt: number
}

export function readLastReaderImport(): LastReaderImport | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<LastReaderImport>
    if (
      typeof p.titleId !== 'number' ||
      typeof p.versionId !== 'number' ||
      typeof p.chapterNumber !== 'number'
    ) {
      return null
    }
    return {
      titleId: p.titleId,
      versionId: p.versionId,
      chapterNumber: p.chapterNumber,
      titleName: typeof p.titleName === 'string' ? p.titleName : null,
      savedAt: typeof p.savedAt === 'number' ? p.savedAt : 0,
    }
  } catch {
    return null
  }
}

export function writeLastReaderImport(
  entry: Omit<LastReaderImport, 'savedAt'> & { savedAt?: number },
): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...entry, savedAt: entry.savedAt ?? Date.now() }),
  )
  window.dispatchEvent(new Event('panui-lastReaderImport'))
}
