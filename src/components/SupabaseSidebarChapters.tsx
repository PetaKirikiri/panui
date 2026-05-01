import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import type { ReadingBatch } from '../content/schema'
import { readLastReaderImport } from '../lib/lastReaderImport'
import { SidebarChapterBookmarkJump } from './SidebarChapterBookmarkJump'
import {
  distinctChaptersForSidebar,
  fetchStoryReaderPayload,
  parseReaderBatchChapterPage,
} from '../lib/storyBatchesFromSupabase'

function parseTitleVersion(pathname: string): { titleId: string; versionId: string } | null {
  const m = pathname.match(/^\/read\/title\/(\d+)\/version\/(\d+)\//)
  if (!m) return null
  return { titleId: m[1], versionId: m[2] }
}

function resolveDbIds(pathname: string): { titleId: number; versionId: number } | null {
  const route = parseTitleVersion(pathname)
  const lastImport = readLastReaderImport()
  const demoTitleId = import.meta.env.VITE_READER_TITLE_ID as string | undefined
  const demoVersionId = import.meta.env.VITE_READER_VERSION_ID as string | undefined

  if (route) {
    const t = Number(route.titleId)
    const v = Number(route.versionId)
    if (Number.isFinite(t) && Number.isFinite(v)) return { titleId: t, versionId: v }
  }
  if (lastImport != null) {
    return { titleId: lastImport.titleId, versionId: lastImport.versionId }
  }
  if (
    demoTitleId?.trim() &&
    demoVersionId?.trim() &&
    Number.isFinite(Number(demoTitleId)) &&
    Number.isFinite(Number(demoVersionId))
  ) {
    return { titleId: Number(demoTitleId), versionId: Number(demoVersionId) }
  }
  return null
}

function activeChapterFromPath(pathname: string, batches: ReadingBatch[] | undefined): number | null {
  const m = pathname.match(/\/read\/title\/\d+\/version\/\d+\/(\d+)/)
  if (!m || !batches?.length) return null
  const bi = Number(m[1])
  const batch = batches[bi]
  if (!batch?.id) return null
  return parseReaderBatchChapterPage(batch).chapter
}

export function SupabaseSidebarChapters() {
  const location = useLocation()
  const [lastImportSnap, setLastImportSnap] = useState(() => readLastReaderImport())

  useEffect(() => {
    const sync = () => setLastImportSnap(readLastReaderImport())
    sync()
    window.addEventListener('panui-lastReaderImport', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('panui-lastReaderImport', sync)
      window.removeEventListener('storage', sync)
    }
  }, [location.pathname])

  const ids = useMemo(
    () => resolveDbIds(location.pathname),
    [location.pathname, lastImportSnap],
  )

  const { data, isPending, error } = useQuery({
    queryKey: ids ? ['storyReader', ids.titleId, ids.versionId] : ['storyReader', null],
    queryFn: () => fetchStoryReaderPayload(ids!.titleId, ids!.versionId),
    enabled: ids != null,
  })

  const rows = useMemo(
    () => (data?.batches?.length ? distinctChaptersForSidebar(data.batches) : []),
    [data?.batches],
  )

  const activeChapter = activeChapterFromPath(location.pathname, data?.batches)

  if (ids == null) {
    return (
      <p className="text-[11px] leading-snug text-gray-500">
        Open a Supabase story or run Import to list chapters here.
      </p>
    )
  }

  const { titleId, versionId } = ids
  const tid = String(titleId)
  const vid = String(versionId)

  return (
    <>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Story (database)
      </p>
      <p className="mb-2 text-[11px] text-gray-500">
        title {tid} · v{vid}
      </p>
      {isPending ? (
        <p className="text-xs text-gray-500">Loading chapters…</p>
      ) : error ? (
        <p className="text-[11px] text-red-700" role="alert">
          {error instanceof Error ? error.message : 'Could not load chapters.'}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-gray-500">No sentence data yet for this title/version.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(({ chapterNumber, firstBatchIndex }) => {
            const href = `/read/title/${tid}/version/${vid}/${firstBatchIndex}`
            const rowActive = activeChapter === chapterNumber
            const linkClass = rowActive
              ? 'block min-w-0 flex-1 rounded-md bg-white px-2 py-2 text-sm font-medium text-blue-800 shadow-sm ring-1 ring-gray-200'
              : 'block min-w-0 flex-1 rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-100'
            return (
              <li key={chapterNumber} className="flex items-stretch gap-1">
                <Link to={href} className={linkClass}>
                  <span className="block truncate">Chapter {chapterNumber}</span>
                </Link>
                <SidebarChapterBookmarkJump
                  key={`${titleId}-${versionId}-${chapterNumber}`}
                  kind="supabase"
                  titleId={titleId}
                  versionId={versionId}
                  chapterNumber={chapterNumber}
                />
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
