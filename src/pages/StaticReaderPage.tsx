import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BatchReader } from '../components/BatchReader'
import { useReaderViewMode } from '../hooks/useReaderViewMode'
import { FloatingAddNav } from '../components/FloatingAddNav'
import { getDefaultReaderPath, loadChapter } from '../content/registry'
import { readLastBatchIndex, writeLastBatchIndex } from '../content/lastBatch'

export default function StaticReaderPage() {
  const { mode } = useReaderViewMode()
  const navigate = useNavigate()
  const location = useLocation()
  const { bookId = '', chapterId = '', batchIndex: batchIndexParam = '0' } = useParams()
  const fallbackHref = getDefaultReaderPath()
  const [draftEpoch, setDraftEpoch] = useState(0)

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ bookId?: string; chapterId?: string }>
      const d = ce.detail
      if (d?.bookId === bookId && d?.chapterId === chapterId) {
        setDraftEpoch((n) => n + 1)
      }
    }
    window.addEventListener('panui-static-chapter-cleared', handler)
    return () => window.removeEventListener('panui-static-chapter-cleared', handler)
  }, [bookId, chapterId])

  const chapter = useMemo(() => {
    try {
      return loadChapter(bookId, chapterId)
    } catch {
      return null
    }
  }, [bookId, chapterId])

  const batches = chapter?.batches ?? []
  const total = batches.length

  const resolvedIndex = useMemo(() => {
    if (total === 0) return 0
    const parsed = Number.parseInt(batchIndexParam, 10)
    let idx = Number.isFinite(parsed) ? parsed : (readLastBatchIndex(bookId, chapterId) ?? 0)
    idx = Math.max(0, Math.min(idx, total - 1))
    return idx
  }, [batchIndexParam, bookId, chapterId, total])

  const batch = batches[resolvedIndex]

  useEffect(() => {
    if (!chapter || total === 0) return
    writeLastBatchIndex(bookId, chapterId, resolvedIndex)
  }, [bookId, chapterId, chapter, resolvedIndex, total])

  useEffect(() => {
    if (!chapter || total === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && resolvedIndex > 0) {
        navigate(`/read/${bookId}/${chapterId}/${resolvedIndex - 1}`)
      }
      if (e.key === 'ArrowRight' && resolvedIndex < total - 1) {
        navigate(`/read/${bookId}/${chapterId}/${resolvedIndex + 1}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bookId, chapterId, chapter, navigate, resolvedIndex, total])

  const chapterNum = Number.parseInt(chapterId.replace(/^chapter-/, ''), 10) || 1
  const draftStorageKey = `panui:static-draft:${bookId}:${chapterId}:${resolvedIndex}`

  useLayoutEffect(() => {
    const m = location.hash.match(/^#panui-chunk-(\d+)$/)
    if (!m) return
    requestAnimationFrame(() => {
      const el = document.getElementById(`panui-chunk-${m[1]}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [location.hash, resolvedIndex, draftEpoch, bookId, chapterId])

  if (!chapter) {
    return (
      <div className="relative p-8">
        <p className="text-red-600">Chapter not found.</p>
        {fallbackHref ? (
          <Link to={fallbackHref} className="mt-4 inline-block text-blue-600 underline">
            Back to default chapter
          </Link>
        ) : null}
        <FloatingAddNav context={{ mode: 'static', bookId, chapterId }} />
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="relative">
        <div className="p-8">
          <p className="text-gray-600">This chapter has no batches yet.</p>
          {fallbackHref ? (
            <Link to={fallbackHref} className="mt-4 inline-block text-blue-600 underline">
              Back to default chapter
            </Link>
          ) : null}
        </div>
        <FloatingAddNav context={{ mode: 'static', bookId, chapterId }} />
      </div>
    )
  }

  if (batchIndexParam !== String(resolvedIndex)) {
    return (
      <Navigate replace to={`/read/${bookId}/${chapterId}/${resolvedIndex}${location.hash}`} />
    )
  }

  if (!batch) {
    return <Navigate replace to={`/read/${bookId}/${chapterId}/0`} />
  }

  const prevPath = resolvedIndex > 0 ? `/read/${bookId}/${chapterId}/${resolvedIndex - 1}` : null
  const nextPath =
    resolvedIndex < total - 1 ? `/read/${bookId}/${chapterId}/${resolvedIndex + 1}` : null

  const chapterBookmark = {
    kind: 'static' as const,
    bookId,
    chapterId,
    batchIndex: resolvedIndex,
  }

  return (
    <div className="relative">
      <BatchReader
        key={`${draftStorageKey}-${draftEpoch}`}
        batch={batch}
        viewMode={mode}
        storageKey={draftStorageKey}
        chapterNumber={chapterNum}
        chapterBookmark={chapterBookmark}
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

      <FloatingAddNav context={{ mode: 'static', bookId, chapterId }} />
    </div>
  )
}
