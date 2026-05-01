const PREFIX = 'panui:lastBatchIndex:title'

export function lastBatchTitleStorageKey(titleId: string, versionId: string): string {
  return `${PREFIX}:${titleId}:${versionId}`
}

export function readLastBatchIndexTitle(titleId: string, versionId: string): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(lastBatchTitleStorageKey(titleId, versionId))
  if (raw === null) return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

export function writeLastBatchIndexTitle(titleId: string, versionId: string, index: number): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(lastBatchTitleStorageKey(titleId, versionId), String(index))
}
