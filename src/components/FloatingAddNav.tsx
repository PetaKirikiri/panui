import { useEffect, useId, useRef, useState } from 'react'
import { isLikelyInAppWebView } from '../lib/ecosystemShell'

export type FloatingAddContext =
  | { mode: 'static'; bookId: string; chapterId: string }
  | { mode: 'supabase'; titleId: number; versionId: number }

type Props = {
  context: FloatingAddContext
}

export function FloatingAddNav({ context }: Props) {
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [stubNote, setStubNote] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!stubNote) return
    const t = window.setTimeout(() => setStubNote(null), 4500)
    return () => window.clearTimeout(t)
  }, [stubNote])

  function stub(kind: 'chapter' | 'page' | 'paragraph'): void {
    const payload =
      context.mode === 'static'
        ? { kind, ...context }
        : { kind, titleId: context.titleId, versionId: context.versionId }
    console.info('[FloatingAddNav] stub — wire Supabase inserts like Pūrākaukau StoryEditor', payload)
    setStubNote(
      `${kind === 'chapter' ? 'Chapter' : kind === 'page' ? 'Page' : 'Paragraph'}: stub logged to console (DB writes next).`,
    )
    setOpen(false)
  }

  if (typeof navigator !== 'undefined' && isLikelyInAppWebView()) {
    return null
  }

  return (
    <>
      <div ref={wrapRef} className="pointer-events-auto fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {open ? (
          <div
            id={menuId}
            role="menu"
            aria-label="Add structure"
            className="mb-1 min-w-[12rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
              onClick={() => stub('chapter')}
            >
              Add chapter
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
              onClick={() => stub('page')}
            >
              Add page
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
              onClick={() => stub('paragraph')}
            >
              Add paragraph
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-2xl font-light text-white shadow-md hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          aria-label="Add chapter, page, or paragraph"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          +
        </button>
      </div>
      {stubNote ? (
        <div
          role="status"
          className="pointer-events-none fixed bottom-24 left-1/2 z-[60] max-w-md -translate-x-1/2 rounded-md bg-gray-900 px-4 py-2 text-center text-sm text-white shadow-lg"
        >
          {stubNote}
        </div>
      ) : null}
    </>
  )
}
