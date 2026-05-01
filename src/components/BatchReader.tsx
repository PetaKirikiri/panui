import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { ReaderViewMode } from '../context/readerViewModeContext'
import type { ReadingBatch } from '../content/schema'
import type { SentenceToken } from '../db/schema'
import type { ChunkPatternInput } from '../lib/patternMatch'
import type { ConnectorDesignLike } from '../lib/purakauReaderTypes'
import type { PosTypeLike } from '../lib/tokens'
import { partitionAlignedRowBySlotBias, splitPastedBilingual } from '../lib/splitPastedBilingual'
import {
  readStaticChapterBookmark,
  writeStaticChapterBookmark,
  readSupabaseChapterBookmark,
  writeSupabaseChapterBookmark,
  type ChapterBookmark,
  type ChapterBookmarkScope,
} from '../lib/chapterBookmark'
import { FaBookmark, FaRegBookmark } from 'react-icons/fa'
import { MiTeAkaInlineText } from './MiTeAkaInlineText'

function AlignedChunkEditors({
  miChunks,
  enChunks,
  miTokensByParagraph,
  posTypes,
  chunkPatterns,
  connectorDesigns,
  miClassName,
  enClassName,
  onMiChange,
  onEnChange,
  onMiBlur,
  onEnBlur,
  onKeyDown,
  onMergePrevious,
  chapterBookmark,
}: {
  miChunks: string[]
  enChunks: string[]
  miTokensByParagraph?: SentenceToken[][] | undefined
  posTypes?: PosTypeLike[] | undefined
  chunkPatterns?: ChunkPatternInput[] | undefined
  connectorDesigns?: ConnectorDesignLike[] | undefined
  miClassName: string
  enClassName: string
  onMiChange: (index: number, value: string) => void
  onEnChange: (index: number, value: string) => void
  onMiBlur: () => void
  onEnBlur: () => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onMergePrevious: (side: 'mi' | 'en', index: number) => void
  chapterBookmark?: ChapterBookmarkScope | undefined
}) {
  const [editing, setEditing] = useState<{ side: 'mi' | 'en'; index: number } | null>(null)
  const [cursorEndTarget, setCursorEndTarget] = useState<{ side: 'mi' | 'en'; index: number } | null>(
    null,
  )
  const [savedChapterBm, setSavedChapterBm] = useState<ChapterBookmark | null>(null)
  const activeTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const mergingRef = useRef(false)

  useEffect(() => {
    if (!chapterBookmark) {
      setSavedChapterBm(null)
      return
    }
    if (chapterBookmark.kind === 'static') {
      setSavedChapterBm(
        readStaticChapterBookmark(chapterBookmark.bookId, chapterBookmark.chapterId),
      )
    } else {
      setSavedChapterBm(
        readSupabaseChapterBookmark(
          chapterBookmark.titleId,
          chapterBookmark.versionId,
          chapterBookmark.chapterNumber,
        ),
      )
    }
  }, [chapterBookmark])

  function persistChapterBookmark(chunkIndex: number) {
    if (!chapterBookmark) return
    const { batchIndex } = chapterBookmark
    if (chapterBookmark.kind === 'static') {
      writeStaticChapterBookmark(
        chapterBookmark.bookId,
        chapterBookmark.chapterId,
        batchIndex,
        chunkIndex,
      )
    } else {
      writeSupabaseChapterBookmark(
        chapterBookmark.titleId,
        chapterBookmark.versionId,
        chapterBookmark.chapterNumber,
        batchIndex,
        chunkIndex,
      )
    }
    setSavedChapterBm({ batchIndex, chunkIndex })
  }

  /** Skip rows with nothing on either side; keep one row index 0 when doc is blank; keep row open while editing. */
  const visibleIndices = useMemo(() => {
    const n = Math.max(miChunks.length, enChunks.length)
    const out: number[] = []
    const editIdx = editing?.index ?? -1

    if (n === 0) return [0]

    for (let i = 0; i < n; i++) {
      const mi = (miChunks[i] ?? '').trim()
      const en = (enChunks[i] ?? '').trim()
      if (mi || en || i === editIdx) out.push(i)
    }

    if (out.length === 0) return [0]
    return out
  }, [miChunks, enChunks, editing?.index])

  useEffect(() => {
    if (!editing || !cursorEndTarget || !activeTextareaRef.current) return
    if (editing.side !== cursorEndTarget.side || editing.index !== cursorEndTarget.index) return

    const el = activeTextareaRef.current
    const end = el.value.length
    el.setSelectionRange(end, end)
    setCursorEndTarget(null)
  }, [cursorEndTarget, editing])

  useLayoutEffect(() => {
    const el = activeTextareaRef.current
    if (!el || !editing) return
    el.style.height = 'auto'
    const next = Math.max(44, el.scrollHeight)
    el.style.height = `${next}px`
    // #region agent log
    fetch('http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '9af2a9',
      },
      body: JSON.stringify({
        sessionId: '9af2a9',
        location: 'BatchReader.tsx:AlignedChunkEditors:autoSize',
        message: 'chunk textarea autosize',
        data: {
          hypothesisId: 'TA-scroll',
          side: editing.side,
          index: editing.index,
          valueLen: el.value.length,
          scrollHeight: el.scrollHeight,
          appliedPx: next,
        },
        timestamp: Date.now(),
        runId: 'verify-autosize',
      }),
    }).catch(() => {})
    // #endregion
  }, [editing, miChunks, enChunks])

  const readClass =
    'block min-h-10 w-full cursor-text appearance-none whitespace-pre-wrap rounded-sm border-l-4 bg-transparent py-1 pl-3 text-left font-serif text-base leading-relaxed text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
  const miReadClass = `${readClass} border-l-emerald-600`
  const enReadClass = `${readClass} border-l-red-600`
  const miPlaceholderClass = `${miReadClass} text-gray-300`
  const enPlaceholderClass = `${enReadClass} text-gray-300`

  const handleTextareaKeyDown = (
    side: 'mi' | 'en',
    index: number,
    e: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) => {
    onKeyDown(e)
    if (e.defaultPrevented) return
    if (e.key !== 'Backspace' || index === 0) return
    if (e.currentTarget.selectionStart !== 0 || e.currentTarget.selectionEnd !== 0) return

    e.preventDefault()
    mergingRef.current = true
    onMergePrevious(side, index)
    setEditing({ side, index: index - 1 })
    setCursorEndTarget({ side, index: index - 1 })
  }

  const handleBlur = (side: 'mi' | 'en') => {
    if (mergingRef.current) mergingRef.current = false
    if (side === 'mi') onMiBlur()
    else onEnBlur()
    setEditing(null)
  }

  return (
    <div className="space-y-6">
      {visibleIndices.map((i) => {
        const isSavedHere =
          chapterBookmark != null &&
          savedChapterBm != null &&
          savedChapterBm.batchIndex === chapterBookmark.batchIndex &&
          savedChapterBm.chunkIndex === i
        return (
          <div
            key={i}
            id={`panui-chunk-${i}`}
            className="flex scroll-mt-24 items-start gap-2 md:gap-3"
          >
            {chapterBookmark ? (
              <button
                type="button"
                className="mt-1.5 shrink-0 rounded p-1 text-amber-700 hover:bg-amber-50"
                aria-label={
                  isSavedHere
                    ? 'This paragraph is the chapter bookmark (click to keep it here)'
                    : 'Set chapter bookmark to this paragraph (use sidebar icon to jump here)'
                }
                title={
                  isSavedHere
                    ? 'Chapter bookmark · click another row’s icon to move it'
                    : 'Save as chapter bookmark'
                }
                onClick={(e) => {
                  e.preventDefault()
                  persistChapterBookmark(i)
                }}
              >
                {isSavedHere ? (
                  <FaBookmark className="h-4 w-4" aria-hidden />
                ) : (
                  <FaRegBookmark className="h-4 w-4" aria-hidden />
                )}
              </button>
            ) : null}
            <div className="grid min-w-0 flex-1 items-start gap-8 md:grid-cols-2 md:gap-10">
          {editing?.side === 'mi' && editing.index === i ? (
            <textarea
              aria-label={`Te reo Māori chunk ${i + 1}`}
              autoFocus
              rows={1}
              className={miClassName}
              lang="mi"
              ref={activeTextareaRef}
              value={miChunks[i] ?? ''}
              onChange={(e) => onMiChange(i, e.target.value)}
              onBlur={() => handleBlur('mi')}
              onKeyDown={(e) => handleTextareaKeyDown('mi', i, e)}
              spellCheck={false}
            />
          ) : (
            <button
              type="button"
              aria-label={`Edit te reo Māori chunk ${i + 1}`}
              className={miChunks[i] ? miReadClass : miPlaceholderClass}
              lang="mi"
              onClick={() => setEditing({ side: 'mi', index: i })}
            >
              {miChunks[i] ? (
                <MiTeAkaInlineText
                  text={miChunks[i]}
                  alignedEnText={enChunks[i] ?? ''}
                  className="inline text-left"
                  sentenceTokens={
                    miTokensByParagraph?.[i]?.length ? miTokensByParagraph[i] : undefined
                  }
                  posTypes={posTypes}
                  chunkPatterns={chunkPatterns}
                  connectorDesigns={connectorDesigns}
                />
              ) : null}
            </button>
          )}
          {editing?.side === 'en' && editing.index === i ? (
            <textarea
              aria-label={`English chunk ${i + 1}`}
              autoFocus
              rows={1}
              className={enClassName}
              lang="en-NZ"
              ref={activeTextareaRef}
              value={enChunks[i] ?? ''}
              onChange={(e) => onEnChange(i, e.target.value)}
              onBlur={() => handleBlur('en')}
              onKeyDown={(e) => handleTextareaKeyDown('en', i, e)}
              spellCheck={false}
            />
          ) : (
            <button
              type="button"
              aria-label={`Edit English chunk ${i + 1}`}
              className={enChunks[i] ? enReadClass : enPlaceholderClass}
              lang="en-NZ"
              onClick={() => setEditing({ side: 'en', index: i })}
            >
              {enChunks[i] ?? null}
            </button>
          )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Blank-line-separated chunks; keeps empty slots so Māori row i stays paired with English row i. */
function paragraphChunksFromDocText(s: string): string[] {
  const normalized = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.trim()) return []

  const blocks = normalized.split(/\n\s*\n/).map((b) => b.trim())
  while (blocks.length > 0 && blocks[blocks.length - 1] === '') {
    blocks.pop()
  }
  return blocks
}

/** Non-empty paragraphs only (classifier / legacy blur path). */
function paragraphsFromJoinedText(s: string): string[] {
  return paragraphChunksFromDocText(s).filter((b) => b.length > 0)
}

function padAlignedChunks(mi: string[], en: string[]): { mi: string[]; en: string[] } {
  const n = Math.max(mi.length, en.length)
  const mip = [...mi]
  const enp = [...en]
  while (mip.length < n) mip.push('')
  while (enp.length < n) enp.push('')
  return { mi: mip, en: enp }
}

function snippetPreview(s: string, n = 120): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : `${t.slice(0, n)}…`
}

function rebalanceAlignedChunksByLanguage(
  miChunks: string[],
  enChunks: string[],
  chapterNumber: number,
  logCtx?: 'seed' | 'autosave',
): { mi: string[]; en: string[] } {
  const n = Math.max(miChunks.length, enChunks.length)
  const miOut: string[] = []
  const enOut: string[] = []

  for (let i = 0; i < n; i++) {
    const part = partitionAlignedRowBySlotBias(miChunks[i] ?? '', enChunks[i] ?? '')
    miOut.push(part.mi)
    enOut.push(part.en)

    if (logCtx && i < 2) {
      // #region agent log
      fetch('http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '9af2a9',
        },
        body: JSON.stringify({
          sessionId: '9af2a9',
          runId: 'pre-fix',
          hypothesisId: 'HB-rebalance-split',
          location: 'BatchReader.tsx:rebalanceAlignedChunksByLanguage',
          message: 'partitionAlignedRowBySlotBias row',
          data: {
            ctx: logCtx,
            chapterNumber,
            row: i,
            outMiChars: part.mi.trim().length,
            outEnChars: part.en.trim().length,
            outMiPrev: snippetPreview(part.mi),
            outEnPrev: snippetPreview(part.en),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
    }
  }

  return padAlignedChunks(miOut, enOut)
}

function batchToDoc(paragraphs: string[]): string {
  return paragraphs.join('\n\n')
}

function replaceChunk(text: string, index: number, value: string): string {
  const chunks = paragraphChunksFromDocText(text)
  while (chunks.length <= index) chunks.push('')
  chunks[index] = value
  return chunks.join('\n\n')
}

function mergeChunkIntoPrevious(text: string, index: number): string {
  if (index <= 0) return text

  const chunks = paragraphChunksFromDocText(text)
  const current = chunks[index]
  if (typeof current !== 'string') return text

  chunks[index - 1] = [chunks[index - 1], current].filter(Boolean).join(' ')
  chunks.splice(index, 1)
  return chunks.join('\n\n')
}

function loadDraftStrings(key: string): { mi: string; en: string } | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const p = JSON.parse(raw) as { mi?: unknown; en?: unknown }
    if (typeof p.mi === 'string' && typeof p.en === 'string') {
      return { mi: p.mi, en: p.en }
    }
  } catch {
    /* ignore */
  }
  return null
}

function saveDraftStrings(key: string, mi: string, en: string): void {
  try {
    localStorage.setItem(key, JSON.stringify({ mi, en, updatedAt: Date.now() }))
  } catch {
    /* ignore */
  }
}

type BatchProps = {
  batch: ReadingBatch
  viewMode?: ReaderViewMode
  chapterNumber?: number
  storageKey?: string
  onBilingualPersist?: (payload: { mi: string[]; en: string[] }) => Promise<void>
  posTypes?: PosTypeLike[]
  chunkPatterns?: ChunkPatternInput[]
  connectorDesigns?: ConnectorDesignLike[]
  chapterBookmark?: ChapterBookmarkScope
}

export function BatchReader({
  batch,
  viewMode = 'split',
  chapterNumber = 1,
  storageKey,
  onBilingualPersist,
  posTypes,
  chunkPatterns,
  connectorDesigns,
  chapterBookmark,
}: BatchProps) {
  const seed = useMemo(() => {
    const draft = storageKey ? loadDraftStrings(storageKey) : null
    const base = draft ?? {
      mi: batchToDoc(batch.maori),
      en: batchToDoc(batch.english),
    }
    const balanced = rebalanceAlignedChunksByLanguage(
      paragraphChunksFromDocText(base.mi),
      paragraphChunksFromDocText(base.en),
      chapterNumber,
      'seed',
    )
    return {
      mi: batchToDoc(balanced.mi),
      en: batchToDoc(balanced.en),
    }
  }, [batch, chapterNumber, storageKey])

  const [miText, setMiText] = useState(seed.mi)
  const [enText, setEnText] = useState(seed.en)
  const [splitWarnings, setSplitWarnings] = useState<string[]>([])
  const [persistError, setPersistError] = useState<string | null>(null)
  const [persisting, setPersisting] = useState(false)

  const prevSeedFingerRef = useRef<string>('')

  useEffect(() => {
    const finger = `${seed.mi}\n---PANUI---\n${seed.en}`
    if (prevSeedFingerRef.current === finger) return
    prevSeedFingerRef.current = finger

    const driftMi = seed.mi !== miText
    const driftEn = seed.en !== enText
    // #region agent log
    fetch('http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '9af2a9',
      },
      body: JSON.stringify({
        sessionId: '9af2a9',
        runId: 'pre-fix',
        hypothesisId: 'H1-seed-drift',
        location: 'BatchReader.tsx:seedVsState',
        message: 'seed snapshot changed — compare to editor state',
        data: {
          chapterNumber,
          driftMi,
          driftEn,
          seedMiChars: seed.mi.length,
          stateMiChars: miText.length,
          seedEnChars: seed.en.length,
          stateEnChars: enText.length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }, [chapterNumber, enText, miText, seed.en, seed.mi])

  useEffect(() => {
    if (!storageKey) return
    const id = window.setTimeout(() => {
      saveDraftStrings(storageKey, miText, enText)
    }, 450)
    return () => window.clearTimeout(id)
  }, [storageKey, miText, enText])

  /** Aligned chunk editor: language placement wins before Te Aka / word-state rendering. */
  const persistAlignedChunksToBackend = useCallback(() => {
    setSplitWarnings([])
    if (!onBilingualPersist) return

    const { mi: miPayload, en: enPayload } = rebalanceAlignedChunksByLanguage(
      paragraphChunksFromDocText(miText),
      paragraphChunksFromDocText(enText),
      chapterNumber,
      'autosave',
    )
    const nextMiText = batchToDoc(miPayload)
    const nextEnText = batchToDoc(enPayload)

    const willShiftMi = nextMiText !== miText
    const willShiftEn = nextEnText !== enText
    if (willShiftMi || willShiftEn) {
      // #region agent log
      fetch('http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '9af2a9',
        },
        body: JSON.stringify({
          sessionId: '9af2a9',
          runId: 'pre-fix',
          hypothesisId: 'HP-autosave-shift',
          location: 'BatchReader.tsx:persistAlignedChunksToBackend',
          message: 'rebalance will rewrite one or both columns before save',
          data: {
            chapterNumber,
            willShiftMi,
            willShiftEn,
            nextMiChars: nextMiText.length,
            nextEnChars: nextEnText.length,
            nextMiPrev: snippetPreview(nextMiText),
            nextEnPrev: snippetPreview(nextEnText),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
    }

    if (nextMiText !== miText) setMiText(nextMiText)
    if (nextEnText !== enText) setEnText(nextEnText)

    void (async () => {
      try {
        setPersistError(null)
        setPersisting(true)
        await onBilingualPersist({ mi: miPayload, en: enPayload })
      } catch (e) {
        setPersistError(e instanceof Error ? e.message : 'Could not save to database.')
      } finally {
        setPersisting(false)
      }
    })()
  }, [chapterNumber, enText, miText, onBilingualPersist])

  const skipAlignedAutosaveRef = useRef(true)

  useEffect(() => {
    if (!onBilingualPersist || viewMode !== 'split') return
    if (skipAlignedAutosaveRef.current) {
      skipAlignedAutosaveRef.current = false
      return
    }
    const id = window.setTimeout(() => persistAlignedChunksToBackend(), 750)
    return () => window.clearTimeout(id)
  }, [enText, miText, onBilingualPersist, persistAlignedChunksToBackend, viewMode])

  const commitColumnBlur = useCallback(
    (side: 'mi' | 'en') => {
      const sourceText = side === 'mi' ? miText : enText
      const raw = sourceText.trim()

      let persistPayload: { mi: string[]; en: string[] } | null = null

      if (!raw) {
        if (side === 'mi') setMiText('')
        else setEnText('')
        setSplitWarnings([])
        return
      }

      const splitBase = splitPastedBilingual(sourceText, chapterNumber)
      const biased = partitionAlignedRowBySlotBias(splitBase.mi, splitBase.en)
      const result = { ...splitBase, mi: biased.mi, en: biased.en }
      const normalized = sourceText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const multiBlock = paragraphsFromJoinedText(normalized).length >= 2
      const splitMi = paragraphsFromJoinedText(result.mi)
      const splitEn = paragraphsFromJoinedText(result.en)
      const classifierFilledBothColumns =
        splitMi.length > 0 && splitEn.length > 0
      const useFullSplit = multiBlock || classifierFilledBothColumns

      /** Split of one column found both langs (e.g. paste); otherwise only touch the edited column so the other is not cleared. */
      const bilingualInEditedColumn = splitMi.length > 0 && splitEn.length > 0

      if (useFullSplit) {
        if (side === 'mi') {
          setMiText(result.mi)
          if (bilingualInEditedColumn) setEnText(result.en)
          setSplitWarnings(result.warnings)
          persistPayload = bilingualInEditedColumn
            ? { mi: splitMi, en: splitEn }
            : { mi: splitMi, en: paragraphsFromJoinedText(enText) }
        } else {
          setEnText(result.en)
          if (bilingualInEditedColumn) setMiText(result.mi)
          setSplitWarnings(result.warnings)
          persistPayload = bilingualInEditedColumn
            ? { mi: splitMi, en: splitEn }
            : { mi: paragraphsFromJoinedText(miText), en: splitEn }
        }
      } else {
        setSplitWarnings([])
      }

      if (persistPayload && onBilingualPersist) {
        void (async () => {
          try {
            setPersistError(null)
            setPersisting(true)
            await onBilingualPersist(persistPayload!)
          } catch (e) {
            setPersistError(e instanceof Error ? e.message : 'Could not save to database.')
          } finally {
            setPersisting(false)
          }
        })()
      }
    },
    [chapterNumber, enText, miText, onBilingualPersist],
  )

  const taBase =
    'min-h-[42vh] w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-3 font-serif text-base leading-relaxed text-gray-900 caret-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
  const taMiClass = `${taBase} border-l-4 border-l-emerald-600`
  const taEnClass = `${taBase} border-l-4 border-l-red-600`
  const chunkTaBase =
    'w-full min-h-0 resize-none overflow-hidden rounded-md border border-gray-300 bg-white px-3 py-3 font-serif text-base leading-relaxed text-gray-900 caret-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
  const chunkMiClass = `${chunkTaBase} border-l-4 border-l-emerald-600`
  const chunkEnClass = `${chunkTaBase} border-l-4 border-l-red-600`

  const blurEscape = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.currentTarget.blur()
    }
  }

  const readMiParas = paragraphChunksFromDocText(miText)
  const readEnParas = paragraphChunksFromDocText(enText)

  const miField = (
    <section aria-label="Te reo Māori">
      <textarea
        className={taMiClass}
        lang="mi"
        value={miText}
        onChange={(e) => setMiText(e.target.value)}
        onBlur={() => commitColumnBlur('mi')}
        onKeyDown={blurEscape}
        spellCheck={false}
      />
    </section>
  )

  const enField = (
    <section aria-label="English">
      <textarea
        className={taEnClass}
        lang="en-NZ"
        value={enText}
        onChange={(e) => setEnText(e.target.value)}
        onBlur={() => commitColumnBlur('en')}
        onKeyDown={blurEscape}
        spellCheck={false}
      />
    </section>
  )

  return (
    <article className="panui-content px-4 py-8">
      {persisting ? (
        <p className="mb-3 text-xs text-gray-500" role="status">
          Saving bilingual text to the database…
        </p>
      ) : null}
      {persistError ? (
        <p className="mb-3 text-xs text-red-600" role="alert">
          {persistError}
        </p>
      ) : null}

      {viewMode === 'split' ? (
        <AlignedChunkEditors
          miChunks={readMiParas}
          enChunks={readEnParas}
          miTokensByParagraph={batch.miTokens}
          posTypes={posTypes}
          chunkPatterns={chunkPatterns}
          connectorDesigns={connectorDesigns}
          miClassName={chunkMiClass}
          enClassName={chunkEnClass}
          onMiChange={(index, value) => setMiText((text) => replaceChunk(text, index, value))}
          onEnChange={(index, value) => setEnText((text) => replaceChunk(text, index, value))}
          onMiBlur={persistAlignedChunksToBackend}
          onEnBlur={persistAlignedChunksToBackend}
          onKeyDown={blurEscape}
          onMergePrevious={(side, index) => {
            if (side === 'mi') setMiText((text) => mergeChunkIntoPrevious(text, index))
            else setEnText((text) => mergeChunkIntoPrevious(text, index))
          }}
          chapterBookmark={chapterBookmark}
        />
      ) : viewMode === 'mi' ? (
        miField
      ) : (
        enField
      )}
      {splitWarnings.length > 0 ? (
        <aside className="mt-6 border-t border-amber-100 pt-4">
          <ul className="list-inside list-disc text-xs text-amber-900">
            {splitWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </aside>
      ) : null}
    </article>
  )
}
