import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BatchReader } from '../components/BatchReader'
import { useReaderViewMode } from '../hooks/useReaderViewMode'
import { FloatingAddNav } from '../components/FloatingAddNav'
import { getDefaultReaderPath } from '../content/registry'
import {
  fetchStoryReaderPayload,
  parseReaderBatchChapterPage,
} from '../lib/storyBatchesFromSupabase'
import { persistSupabaseReaderBilingualPage } from '../lib/persistSupabaseReaderPage'
import { readLastBatchIndexTitle, writeLastBatchIndexTitle } from '../content/lastBatchTitle'
import { setReaderChapterSession } from '../lib/readerChapterSession'

export default function SupabaseReaderPage() {
  const queryClient = useQueryClient()
  const [editorKey, setEditorKey] = useState(0)
  const { mode } = useReaderViewMode()
  const navigate = useNavigate()
  const location = useLocation()
  const fallbackHref = getDefaultReaderPath()
  const {
    titleId = '',
    versionId = '',
    batchIndex: batchIndexParam = '0',
  } = useParams<{ titleId: string; versionId: string; batchIndex: string }>()

  const titleNum = Number(titleId)
  const versionNum = Number(versionId)

  const query = useQuery({
    queryKey: ['storyReader', titleNum, versionNum],
    queryFn: () => fetchStoryReaderPayload(titleNum, versionNum),
    enabled: Number.isFinite(titleNum) && Number.isFinite(versionNum),
  })

  const batches = query.data?.batches ?? []
  const total = batches.length

  const resolvedIndex = useMemo(() => {
    if (total === 0) return 0
    const parsed = Number.parseInt(batchIndexParam, 10)
    let idx = Number.isFinite(parsed)
      ? parsed
      : (readLastBatchIndexTitle(titleId, versionId) ?? 0)
    idx = Math.max(0, Math.min(idx, total - 1))
    return idx
  }, [batchIndexParam, titleId, versionId, total])

  const batch = batches[resolvedIndex]

  useEffect(() => {
    if (!batch || !titleId || !versionId) return
    const { chapter } = parseReaderBatchChapterPage(batch)
    setReaderChapterSession(titleId, versionId, chapter)
  }, [batch, titleId, versionId])

  useEffect(() => {
    if (!query.data || total === 0) return
    writeLastBatchIndexTitle(titleId, versionId, resolvedIndex)
  }, [query.data, resolvedIndex, titleId, total, versionId])

  useEffect(() => {
    if (!query.data || total === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && resolvedIndex > 0) {
        navigate(`/read/title/${titleId}/version/${versionId}/${resolvedIndex - 1}`)
      }
      if (e.key === 'ArrowRight' && resolvedIndex < total - 1) {
        navigate(`/read/title/${titleId}/version/${versionId}/${resolvedIndex + 1}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, query.data, resolvedIndex, titleId, total, versionId])

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ titleId?: number; versionId?: number }>
      const d = ce.detail
      if (d?.titleId === titleNum && d?.versionId === versionNum) {
        setEditorKey((k) => k + 1)
      }
    }
    window.addEventListener('panui-chapter-contents-cleared', handler)
    return () => window.removeEventListener('panui-chapter-contents-cleared', handler)
  }, [titleNum, versionNum])

  const draftStorageKey = `panui:supabase-draft:${titleId}:${versionId}:${resolvedIndex}`

  useLayoutEffect(() => {
    const m = location.hash.match(/^#panui-chunk-(\d+)$/)
    if (!m) return
    requestAnimationFrame(() => {
      const el = document.getElementById(`panui-chunk-${m[1]}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [location.hash, resolvedIndex, editorKey, titleId, versionId])

  const onBilingualPersist = useCallback(
    async (payload: { mi: string[]; en: string[] }) => {
      const b = query.data?.batches?.[resolvedIndex]
      if (!b) throw new Error('Missing batch')
      const { chapter, page } = parseReaderBatchChapterPage(b)
      await persistSupabaseReaderBilingualPage({
        titleId: titleNum,
        versionId: versionNum,
        chapterNumber: chapter,
        pageNumber: page,
        miParagraphs: payload.mi,
        enParagraphs: payload.en,
      })
      try {
        localStorage.removeItem(draftStorageKey)
      } catch {
        /* ignore */
      }
      await queryClient.refetchQueries({ queryKey: ['storyReader', titleNum, versionNum] })
      setEditorKey((k) => k + 1)
    },
    [draftStorageKey, query.data, queryClient, resolvedIndex, titleNum, versionNum],
  )

  if (!Number.isFinite(titleNum) || !Number.isFinite(versionNum)) {
    return (
      <div className="p-8">
        <p className="text-red-600">Invalid title or version id.</p>
        {fallbackHref ? (
          <Link to={fallbackHref} className="mt-4 inline-block text-blue-600 underline">
            Back to reader
          </Link>
        ) : null}
      </div>
    )
  }

  if (query.isPending) {
    return (
      <div className="relative p-8">
        <p className="text-gray-600">Loading story…</p>
        <FloatingAddNav context={{ mode: 'supabase', titleId: titleNum, versionId: versionNum }} />
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="relative p-8">
        <p className="text-red-600">
          {query.error instanceof Error ? query.error.message : 'Could not load story.'}
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Fallback:{' '}
          {fallbackHref ? (
            <Link className="text-blue-600 underline" to={fallbackHref}>
              static demo chapter
            </Link>
          ) : (
            'configure static content in registry.'
          )}
        </p>
        <FloatingAddNav context={{ mode: 'supabase', titleId: titleNum, versionId: versionNum }} />
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="relative">
        <div className="p-8">
          <p className="text-gray-600">
            No sentence rows for this title/version (or missing en/mi sources).
          </p>
        </div>
        <FloatingAddNav context={{ mode: 'supabase', titleId: titleNum, versionId: versionNum }} />
      </div>
    )
  }

  if (batchIndexParam !== String(resolvedIndex)) {
    return (
      <Navigate
        replace
        to={`/read/title/${titleId}/version/${versionId}/${resolvedIndex}${location.hash}`}
      />
    )
  }

  if (!batch) {
    return <Navigate replace to={`/read/title/${titleId}/version/${versionId}/0`} />
  }

  const prevPath =
    resolvedIndex > 0 ? `/read/title/${titleId}/version/${versionId}/${resolvedIndex - 1}` : null
  const nextPath =
    resolvedIndex < total - 1
      ? `/read/title/${titleId}/version/${versionId}/${resolvedIndex + 1}`
      : null

  const { chapter: readerChapterNumber } = parseReaderBatchChapterPage(batch)

  return (
    <div className="relative">
      <BatchReader
        key={`${draftStorageKey}-${editorKey}`}
        batch={batch}
        viewMode={mode}
        storageKey={draftStorageKey}
        chapterNumber={readerChapterNumber}
        chapterBookmark={{
          kind: 'supabase',
          titleId: titleNum,
          versionId: versionNum,
          chapterNumber: readerChapterNumber,
          batchIndex: resolvedIndex,
        }}
        onBilingualPersist={onBilingualPersist}
        posTypes={query.data?.posTypes ?? []}
        chunkPatterns={query.data?.chunkPatterns ?? []}
        connectorDesigns={query.data?.connectorDesigns ?? []}
      />

      <nav
        className="panui-content flex items-center justify-between gap-4 border-t border-gray-100 px-4 pb-12 pt-6"
        aria-label="Page navigation"
      >
        {prevPath ? (
          <Link to={prevPath} className="text-blue-600 underline">
            Previous
          </Link>
        ) : (
          <span className="text-gray-400">Previous</span>
        )}
        {nextPath ? (
          <Link to={nextPath} className="text-blue-600 underline">
            Next
          </Link>
        ) : (
          <span className="text-gray-400">Next</span>
        )}
      </nav>

      <FloatingAddNav context={{ mode: 'supabase', titleId: titleNum, versionId: versionNum }} />
    </div>
  )
}
