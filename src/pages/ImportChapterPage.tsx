import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ParagraphBlock } from '../components/ParagraphBlock'
import {
  parseBilingualPaste,
  segmentsToSentenceDrafts,
} from '../lib/bilingualPaste'
import {
  fetchTitlesForImport,
  fetchVersionsForTitle,
  importChapterToSupabase,
} from '../lib/importChapterToSupabase'
import { writeLastReaderImport } from '../lib/lastReaderImport'

export default function ImportChapterPage() {
  const queryClient = useQueryClient()
  const [titleId, setTitleId] = useState<number | ''>('')
  const [versionId, setVersionId] = useState<number | ''>('')
  const [chapterNumber, setChapterNumber] = useState(1)
  const [paste, setPaste] = useState('')
  const [previewIndex, setPreviewIndex] = useState(0)

  const titlesQuery = useQuery({
    queryKey: ['importTitles'],
    queryFn: fetchTitlesForImport,
  })

  const versionsQuery = useQuery({
    queryKey: ['importVersions', titleId],
    queryFn: () => fetchVersionsForTitle(titleId as number),
    enabled: typeof titleId === 'number' && Number.isFinite(titleId),
  })

  const parsed = useMemo(() => {
    const ch = Number.isFinite(chapterNumber) && chapterNumber >= 1 ? chapterNumber : 1
    if (!paste.trim()) {
      return null
    }
    return parseBilingualPaste(paste, ch)
  }, [paste, chapterNumber])

  const batches = parsed?.batches ?? []
  const previewBatch = batches[Math.min(previewIndex, Math.max(0, batches.length - 1))]

  const mutation = useMutation({
    mutationFn: async () => {
      const ch = Number.isFinite(chapterNumber) && chapterNumber >= 1 ? chapterNumber : 1
      if (typeof titleId !== 'number' || typeof versionId !== 'number') {
        throw new Error('Select title and version.')
      }
      const result = parseBilingualPaste(paste, ch)
      if (result.segments.length === 0) {
        throw new Error('Nothing to import — check paste format (paired EN/MI paragraphs).')
      }
      const drafts = segmentsToSentenceDrafts(result.segments, ch)
      await importChapterToSupabase({
        titleId,
        versionId,
        chapterNumber: ch,
        enDrafts: drafts.en,
        miDrafts: drafts.mi,
      })
      await queryClient.invalidateQueries({ queryKey: ['storyReader', titleId, versionId] })
      return result.segments.length
    },
    onSuccess: () => {
      const ch = Number.isFinite(chapterNumber) && chapterNumber >= 1 ? chapterNumber : 1
      if (typeof titleId !== 'number' || typeof versionId !== 'number') return
      const titleName = titlesQuery.data?.find((t) => t.id === titleId)?.name ?? null
      writeLastReaderImport({
        titleId,
        versionId,
        chapterNumber: ch,
        titleName,
      })
    },
  })

  const demoTitleId = import.meta.env.VITE_READER_TITLE_ID as string | undefined
  const demoVersionId = import.meta.env.VITE_READER_VERSION_ID as string | undefined
  const readerHref =
    demoTitleId && demoVersionId
      ? `/read/title/${demoTitleId.trim()}/version/${demoVersionId.trim()}/0`
      : null

  return (
    <div className="panui-content px-4 py-8">
      <h1 className="text-xl font-semibold text-gray-900">Import bilingual chapter</h1>
      <p className="mt-2 max-w-2xl text-sm text-gray-600">
        Paste alternating Māori / English paragraphs (pairs). Use standalone lines{' '}
        <code className="rounded bg-gray-100 px-1">Page N</code>, or{' '}
        <code className="rounded bg-gray-100 px-1">Page N …</code> at the start of a paragraph
        (e.g. <code className="rounded bg-gray-100 px-1">Page 1 Whakaī ana…</code>). Editorial lines
        like &quot;Additional info:&quot; strip to the text after the colon. Requires Supabase write access on{' '}
        <code className="rounded bg-gray-100 px-1">story_sources</code> and{' '}
        <code className="rounded bg-gray-100 px-1">story_sentences</code>.
      </p>

      <div className="mt-6 grid max-w-3xl gap-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Title</span>
          <select
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            value={titleId === '' ? '' : String(titleId)}
            onChange={(e) => {
              const v = e.target.value
              setTitleId(v === '' ? '' : Number(v))
              setVersionId('')
            }}
          >
            <option value="">Select…</option>
            {(titlesQuery.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (id {t.id})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Version</span>
          <select
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            value={versionId === '' ? '' : String(versionId)}
            onChange={(e) => {
              const v = e.target.value
              setVersionId(v === '' ? '' : Number(v))
            }}
            disabled={titleId === ''}
          >
            <option value="">Select…</option>
            {(versionsQuery.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.label ?? 'Version'} {v.version_number != null ? `(${v.version_number})` : ''} —
                id {v.id}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Chapter number</span>
          <input
            type="number"
            min={1}
            className="mt-1 block w-32 rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={chapterNumber}
            onChange={(e) => setChapterNumber(Number(e.target.value))}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Paste</span>
          <textarea
            className="mt-1 block min-h-[200px] w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Māori paragraph&#10;&#10;English paragraph&#10;&#10;Page 2&#10;&#10;…"
          />
        </label>
      </div>

      {parsed?.warnings.length ? (
        <div className="mt-4 max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Warnings</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {parsed.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {parsed && batches.length > 0 ? (
        <div className="mt-8 border-t border-gray-100 pt-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600">
              Preview batch {previewIndex + 1} of {batches.length} · {parsed.segments.length}{' '}
              paragraph pairs
            </span>
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
              disabled={previewIndex <= 0}
              onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
              disabled={previewIndex >= batches.length - 1}
              onClick={() => setPreviewIndex((i) => Math.min(batches.length - 1, i + 1))}
            >
              Next
            </button>
          </div>
          {previewBatch ? (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-gray-200">
                <div className="min-h-0 p-4">
                  <ParagraphBlock paragraphs={previewBatch.maori} lang="mi" />
                </div>
                <div className="min-h-0 p-4">
                  <ParagraphBlock paragraphs={previewBatch.english} lang="en-NZ" />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : paste.trim() ? (
        <p className="mt-4 text-sm text-gray-500">
          No batches parsed — use paired paragraphs (English / te reo); classification uses macrons,
          word lists, and phrases (either language may come first in each pair).
        </p>
      ) : null}

      <div className="mt-8">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={
              mutation.isPending ||
              typeof titleId !== 'number' ||
              typeof versionId !== 'number' ||
              !paste.trim()
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Importing…' : 'Import to Supabase'}
          </button>
          {typeof titleId === 'number' && typeof versionId === 'number' ? (
            <Link
              className="text-sm text-blue-600 underline"
              to={`/read/title/${titleId}/version/${versionId}/0`}
            >
              Open reader for this title/version
            </Link>
          ) : readerHref ? (
            <Link className="text-sm text-blue-600 underline" to={readerHref}>
              Open reader (env defaults)
            </Link>
          ) : null}
        </div>
        {typeof titleId === 'number' && typeof versionId === 'number' ? (
          <p className="mt-2 max-w-xl text-xs text-gray-500">
            Sidebar &quot;Chapter 1&quot; is static JSON; the link above opens this title/version from
            Supabase (your import).
          </p>
        ) : null}
      </div>

      {mutation.isSuccess ? (
        <p className="mt-4 text-sm text-green-700">
          Imported {mutation.data} paragraph pairs for chapter {chapterNumber}.
        </p>
      ) : null}

      {mutation.isError ? (
        <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm text-red-600">
          {mutation.error instanceof Error ? mutation.error.message : String(mutation.error)}
        </p>
      ) : null}

      {titlesQuery.isError ? (
        <p className="mt-4 text-sm text-red-600">
          Could not load titles — check Supabase env and RLS for read on{' '}
          <code className="rounded bg-gray-100 px-1">titles</code>.
        </p>
      ) : null}
    </div>
  )
}
