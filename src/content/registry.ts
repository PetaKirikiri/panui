import { parseChapterManifest, type ChapterManifest } from './schema'

/** All `chapter-*.json` manifests for book 1 (17 chapters, Philosopher's Stone). */
const hp1ChapterModules = import.meta.glob<{ default: unknown }>(
  '../../content/harry-potter/book-1/chapter-*.json',
  { eager: true },
)

function chapterIdFromPath(modulePath: string): string | null {
  const m = modulePath.match(/\/(chapter-\d+)\.json$/)
  return m?.[1] ?? null
}

function sortChapterIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const na = parseInt(a.replace(/^chapter-/, ''), 10)
    const nb = parseInt(b.replace(/^chapter-/, ''), 10)
    return na - nb
  })
}

function buildRegistry(): Record<string, Record<string, unknown>> {
  const hp1: Record<string, unknown> = {}
  for (const [path, mod] of Object.entries(hp1ChapterModules)) {
    const chapterId = chapterIdFromPath(path)
    if (!chapterId) continue
    const payload = mod && typeof mod === 'object' && 'default' in mod ? mod.default : mod
    hp1[chapterId] = payload
  }
  const ordered: Record<string, unknown> = {}
  for (const id of sortChapterIds(Object.keys(hp1))) {
    ordered[id] = hp1[id]
  }
  return {
    'harry-potter-1': ordered,
  }
}

const REGISTRY = buildRegistry()

export function loadChapter(bookId: string, chapterId: string): ChapterManifest {
  const raw = REGISTRY[bookId]?.[chapterId]
  if (!raw) {
    throw new Error(`Unknown chapter: ${bookId}/${chapterId}`)
  }
  const parsed = parseChapterManifest(raw)
  const batches = [...parsed.batches].sort((a, b) => a.order - b.order)
  return { ...parsed, batches }
}

export function listRegisteredPaths(): { bookId: string; chapterId: string }[] {
  const out: { bookId: string; chapterId: string }[] = []
  for (const bookId of Object.keys(REGISTRY)) {
    const chapterIds = sortChapterIds(Object.keys(REGISTRY[bookId] ?? {}))
    for (const chapterId of chapterIds) {
      out.push({ bookId, chapterId })
    }
  }
  return out
}

export type SidebarChapter = {
  bookId: string
  chapterId: string
  title?: string
  href: string
}

/** Labels for left sidebar navigation */
export function listSidebarChapters(): SidebarChapter[] {
  const paths = listRegisteredPaths()
  return paths.map(({ bookId, chapterId }) => {
    const chapterNum = parseInt(chapterId.replace(/^chapter-/, ''), 10)
    try {
      const ch = loadChapter(bookId, chapterId)
      const label =
        Number.isFinite(chapterNum) && ch.title
          ? `${chapterNum}. ${ch.title}`
          : ch.title
      return {
        bookId,
        chapterId,
        title: label,
        href: `/read/${bookId}/${chapterId}/0`,
      }
    } catch {
      return {
        bookId,
        chapterId,
        href: `/read/${bookId}/${chapterId}/0`,
      }
    }
  })
}

export function getDefaultReaderPath(): string | null {
  const first = listRegisteredPaths()[0]
  return first ? `/read/${first.bookId}/${first.chapterId}/0` : null
}
