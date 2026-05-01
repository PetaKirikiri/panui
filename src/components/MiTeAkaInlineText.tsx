import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { miChunkSegments } from '../lib/miChunkSpans'
import { normalizeWordRegistrySurface } from '../lib/miWordTokens'
import { fetchWordRegistryPresence } from '../lib/fetchWordRegistryPresence'
import {
  fetchTeAkaTooltip,
  type TeAkaTooltipData,
  type TeAkaTooltipEntry,
  logTeAkaHoverDebug,
} from '../lib/fetchTeAkaTooltip'
import { fetchMatchTeAkaSense, sensesPayloadFromTooltipEntries } from '../lib/fetchMatchTeAkaSense'
import { getSupabaseRestBaseUrl } from '../lib/supabase'
import {
  type TeAkaEntry,
  formatTeAkaTooltipDefinition,
  maybeSplitEmbeddedEnglishExample,
  teAkaExampleEnglishLine,
  teAkaExampleMiLine,
} from '../lib/teAkaWordRegistry'
import type { SentenceToken } from '../db/schema'
import type { ChunkPatternInput } from '../lib/patternMatch'
import type { PosTypeLike } from '../lib/tokens'
import { isPunctuationOnlyToken, stripPunctuationFromWord } from '../lib/tokens'
import type { ConnectorDesignLike } from '../lib/purakauReaderTypes'
import { PurakauReaderTokens } from './PurakauReaderTokens'

const HIDE_MS = 280

/** Debug ingest — session da240d (do not log secrets). */
function dbgMiPopover(
  location: string,
  message: string,
  hypothesisId: string,
  data?: Record<string, unknown>,
  runId: string = 'pre-fix',
) {
  // #region agent log
  fetch('http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'da240d',
    },
    body: JSON.stringify({
      sessionId: 'da240d',
      runId,
      hypothesisId,
      location,
      message,
      data: data ?? {},
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
}

function wordSpanClasses(registryKnown: boolean | undefined): string {
  const base =
    'cursor-help border-b border-dotted transition-colors '
  if (registryKnown === undefined) {
    return `${base}border-gray-400/70 text-gray-900 hover:border-gray-600 hover:bg-gray-50`
  }
  if (registryKnown) {
    return `${base}border-green-600 text-green-800 hover:bg-green-50`
  }
  return `${base}border-red-500 text-red-700 hover:bg-red-50`
}

type TipAnchor = {
  lemma: string
  surfaceRaw: string
  segmentIndex: number
  rect: DOMRect
}

type PopTabId = 'te_aka' | 'sentence'

type TeAkaSenseChoice = { senseIndex: number; pos: string; preview: string }

/** One row per Te Aka sense — same order as the dictionary tab (no merging by POS). */
function buildTeAkaSenseChoices(entries: TeAkaTooltipEntry[]): TeAkaSenseChoice[] {
  return entries.map((raw, senseIndex) => {
    const ent = raw as TeAkaEntry
    const pos = String(raw.pos ?? '').trim() || '(no POS label)'
    const gloss = formatTeAkaTooltipDefinition(ent).trim()
    const preview = gloss.length > 120 ? `${gloss.slice(0, 120)}…` : gloss || '—'
    return { senseIndex, pos, preview }
  })
}

function SentenceContextTabBody({
  anchor,
  senseChoices,
  tipLoading,
  senseSuggestLoading,
  selectedSenseIndex,
  onSelectSenseIndex,
}: {
  anchor: TipAnchor
  senseChoices: TeAkaSenseChoice[]
  tipLoading: boolean
  senseSuggestLoading: boolean
  selectedSenseIndex: number | null
  onSelectSenseIndex: (index: number | null) => void
}) {
  const radioName = `occ-sense-${anchor.lemma}-${anchor.segmentIndex}`
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-700" lang="mi">
        <span className="font-semibold text-gray-900">{anchor.surfaceRaw}</span>
        {anchor.surfaceRaw !== anchor.lemma ? (
          <span className="text-gray-500"> · {anchor.lemma}</span>
        ) : null}
      </p>

      <fieldset className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <legend className="text-[0.7rem] font-medium text-gray-800">Sense</legend>
          {senseSuggestLoading ? (
            <span className="text-[0.65rem] text-gray-500">Suggesting…</span>
          ) : null}
          {selectedSenseIndex != null && !tipLoading ? (
            <button
              type="button"
              className="text-[0.65rem] text-blue-700 underline"
              onClick={() => onSelectSenseIndex(null)}
            >
              Clear
            </button>
          ) : null}
        </div>
        {tipLoading ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : senseChoices.length === 0 ? (
          <p className="text-xs text-gray-600">No senses.</p>
        ) : (
          <div className="max-h-56 space-y-1.5 overflow-y-auto" role="radiogroup">
            {senseChoices.map((c) => (
              <label
                key={`${c.senseIndex}-${c.pos}`}
                className="flex cursor-pointer gap-2 rounded px-0.5 py-0.5 hover:bg-gray-50"
              >
                <input
                  type="radio"
                  name={radioName}
                  className="mt-1 shrink-0"
                  checked={selectedSenseIndex === c.senseIndex}
                  onChange={() => onSelectSenseIndex(c.senseIndex)}
                />
                <span className="min-w-0 flex-1">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="min-w-[1rem] tabular-nums text-[0.65rem] text-gray-400">
                      {c.senseIndex + 1}.
                    </span>
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[0.7rem] font-medium text-emerald-900">
                      {c.pos}
                    </span>
                  </span>
                  <span className="mt-0.5 block pl-6 text-[0.68rem] leading-snug text-gray-600">
                    {c.preview}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  )
}

function WordInsightPopover({
  anchor,
  miChunkText,
  alignedEnText,
  tipData,
  tipLoading,
}: {
  anchor: TipAnchor
  miChunkText: string
  alignedEnText: string
  tipData: TeAkaTooltipData | null
  tipLoading: boolean
}) {
  const [tab, setTab] = useState<PopTabId>('te_aka')
  const [sentenceOccurrenceSenseIndex, setSentenceOccurrenceSenseIndex] = useState<number | null>(
    null,
  )
  const [senseSuggestLoading, setSenseSuggestLoading] = useState(false)
  const userPickedSenseRef = useRef(false)
  /** After user clears selection, do not auto-run GPT again until the next word hover. */
  const suppressAutoSenseRef = useRef(false)

  useEffect(() => {
    setTab('te_aka')
  }, [anchor.lemma, anchor.segmentIndex])

  useEffect(() => {
    setSentenceOccurrenceSenseIndex(null)
    userPickedSenseRef.current = false
    suppressAutoSenseRef.current = false
  }, [anchor.lemma, anchor.segmentIndex])

  const senseChoices = useMemo(
    () => buildTeAkaSenseChoices(tipData?.entries ?? []),
    [tipData?.entries],
  )

  useEffect(() => {
    setSentenceOccurrenceSenseIndex((prev) =>
      prev != null && prev >= 0 && prev < senseChoices.length ? prev : null,
    )
  }, [senseChoices])

  const handleManualSenseIndex = useCallback((index: number | null) => {
    if (index === null) suppressAutoSenseRef.current = true
    else userPickedSenseRef.current = true
    setSentenceOccurrenceSenseIndex(index)
  }, [])

  useEffect(() => {
    if (tipLoading || !tipData?.entries.length) return
    if (sentenceOccurrenceSenseIndex != null) return
    if (suppressAutoSenseRef.current) return

    const anon =
      typeof import.meta.env.VITE_SUPABASE_ANON_KEY === 'string'
        ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim()
        : ''
    if (!anon) return

    const ac = new AbortController()
    const senses = sensesPayloadFromTooltipEntries(tipData.entries)
    setSenseSuggestLoading(true)

    void fetchMatchTeAkaSense(
      getSupabaseRestBaseUrl(),
      anon,
      {
        miChunk: miChunkText,
        enChunk: alignedEnText,
        lemma: anchor.lemma,
        surfaceRaw: anchor.surfaceRaw,
        senses,
      },
      ac.signal,
    )
      .then((idx) => {
        if (ac.signal.aborted || userPickedSenseRef.current) return
        if (idx != null) setSentenceOccurrenceSenseIndex(idx)
      })
      .finally(() => {
        if (!ac.signal.aborted) setSenseSuggestLoading(false)
      })

    return () => {
      ac.abort()
    }
  }, [
    tipLoading,
    tipData,
    sentenceOccurrenceSenseIndex,
    anchor.lemma,
    anchor.surfaceRaw,
    miChunkText,
    alignedEnText,
  ])

  useEffect(() => {
    // #region agent log
    dbgMiPopover('MiTeAkaInlineText.tsx:WordInsightPopover', 'tab state', 'H2-H4', {
      tab,
      lemma: anchor.lemma,
      segmentIndex: anchor.segmentIndex,
    })
    // #endregion
  }, [tab, anchor.lemma, anchor.segmentIndex])

  useEffect(() => {
    if (tab !== 'sentence') return
    // #region agent log
    dbgMiPopover(
      'MiTeAkaInlineText.tsx:WordInsightPopover',
      'sentence tab committed',
      'H3',
      { lemma: anchor.lemma },
      'post-fix',
    )
    // #endregion
  }, [tab, anchor.lemma])

  const tabs: { id: PopTabId; label: string }[] = [
    { id: 'te_aka', label: 'Te Aka' },
    { id: 'sentence', label: 'In this sentence' },
  ]

  return (
    <>
      <div className="mb-2 flex gap-1 rounded-lg bg-gray-100 p-0.5" role="tablist" aria-label="Word details">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={
              tab === t.id
                ? 'flex-1 rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-gray-900 shadow-sm'
                : 'flex-1 rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900'
            }
            onClick={() => {
              // #region agent log
              dbgMiPopover(
                'MiTeAkaInlineText.tsx:tab-button',
                'tab click',
                'H2-H5',
                {
                  targetTab: t.id,
                  prevTab: tab,
                },
                'post-fix',
              )
              // #endregion
              setTab(t.id)
            }}
            onMouseDown={(e) => {
              // #region agent log
              const hit = document.elementFromPoint(e.clientX, e.clientY)
              dbgMiPopover(
                'MiTeAkaInlineText.tsx:tab-button',
                'tab mousedown hit test',
                'H6',
                {
                  targetTab: t.id,
                  hitTag: hit?.nodeName ?? null,
                  hitAria:
                    hit instanceof HTMLElement ? hit.getAttribute('aria-label')?.slice(0, 56) : null,
                },
                'post-fix',
              )
              // #endregion
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" hidden={tab !== 'te_aka'} className={tab === 'te_aka' ? '' : 'hidden'}>
        <TeAkaPopoverBody data={tipData} loading={tipLoading} lemmaHint={anchor.lemma} />
      </div>
      <div role="tabpanel" hidden={tab !== 'sentence'} className={tab === 'sentence' ? '' : 'hidden'}>
        <SentenceContextTabBody
          anchor={anchor}
          senseChoices={senseChoices}
          tipLoading={tipLoading}
          senseSuggestLoading={senseSuggestLoading}
          selectedSenseIndex={sentenceOccurrenceSenseIndex}
          onSelectSenseIndex={handleManualSenseIndex}
        />
      </div>
    </>
  )
}

function TeAkaPopoverBody({
  data,
  loading,
  lemmaHint,
}: {
  data: TeAkaTooltipData | null
  loading: boolean
  lemmaHint?: string
}) {
  if (loading) {
    return <p className="text-xs text-gray-500">Loading dictionary…</p>
  }
  if (!data?.entries.length) {
    return (
      <p className="text-xs text-gray-600">
        No Te Aka entry found
        {lemmaHint ? ` for “${lemmaHint}”.` : '.'}
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <p className="font-medium text-gray-900">{data.lemma}</p>
      <ul className="max-h-[min(28rem,60vh)] space-y-3 overflow-y-auto text-xs">
        {data.entries.map((raw, i) => {
          const ent = raw as TeAkaEntry
          const formatted = formatTeAkaTooltipDefinition(ent)
          const split = maybeSplitEmbeddedEnglishExample(formatted)
          const defLine = split.definition
          const gluedEn = split.embeddedExample ?? null
          const miLine = teAkaExampleMiLine(ent)
          let enLine = teAkaExampleEnglishLine(ent)
          if (gluedEn && enLine && gluedEn.trim() === enLine.trim()) enLine = null
          if (!gluedEn && defLine && enLine && enLine.trim() === defLine.trim()) enLine = null
          return (
            <li key={`${raw.pos}-${i}`} className="border-b border-gray-100 pb-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="min-w-[1.25rem] font-medium tabular-nums text-gray-400">
                  {i + 1}.
                </span>
                {raw.pos ? (
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[0.7rem] font-medium text-emerald-900">
                    {raw.pos}
                  </span>
                ) : null}
              </div>
              {defLine ? (
                <p className="mt-1.5 leading-snug text-[0.8125rem] text-gray-900">{defLine}</p>
              ) : null}
              {miLine ? (
                <p className="mt-1.5 text-[0.75rem] leading-snug text-gray-800" lang="mi">
                  {miLine}
                </p>
              ) : null}
              {gluedEn ? (
                <p className="mt-1 text-[0.75rem] leading-snug text-gray-600 italic">{gluedEn}</p>
              ) : null}
              {enLine ? (
                <p className="mt-1 text-[0.75rem] leading-snug text-gray-600 italic">{enLine}</p>
              ) : null}
            </li>
          )
        })}
      </ul>
      {data.sourceUrl ? (
        <a
          className="inline-block text-xs font-medium text-blue-700 underline"
          href={data.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Te Aka — Māori Dictionary
        </a>
      ) : null}
    </div>
  )
}

export function MiTeAkaInlineText({
  text,
  alignedEnText = '',
  className,
  sentenceTokens,
  posTypes,
  chunkPatterns,
  connectorDesigns,
}: {
  text: string
  /** English chunk aligned with `text` (same row); used to suggest a Te Aka sense. */
  alignedEnText?: string
  className?: string
  /** When set with POS metadata, render Pūrākau-style underlines + phrase chunks. */
  sentenceTokens?: SentenceToken[]
  posTypes?: PosTypeLike[]
  chunkPatterns?: ChunkPatternInput[]
  connectorDesigns?: ConnectorDesignLike[]
}) {
  const usePurakau =
    Array.isArray(sentenceTokens) &&
    sentenceTokens.length > 0 &&
    Array.isArray(posTypes) &&
    posTypes.length > 0

  const segments = useMemo(() => (usePurakau ? [] : miChunkSegments(text)), [text, usePurakau])
  const lemmas = useMemo(() => {
    if (usePurakau) {
      const s = new Set<string>()
      for (const t of sentenceTokens!) {
        if (isPunctuationOnlyToken(t)) continue
        const lem = normalizeWordRegistrySurface(stripPunctuationFromWord(t.text ?? ''))
        if (lem.length >= 2) s.add(lem)
      }
      return [...s].sort()
    }
    const s = new Set<string>()
    for (const seg of segments) {
      if (seg.kind === 'word') s.add(seg.lemma)
    }
    return [...s].sort()
  }, [segments, sentenceTokens, usePurakau])

  const presenceQuery = useQuery({
    queryKey: ['wordRegistryPresence', lemmas.join('\u0001')],
    queryFn: () => fetchWordRegistryPresence(lemmas),
    enabled: lemmas.length > 0,
    staleTime: 60_000,
  })

  const knownSet = presenceQuery.data

  const [anchor, setAnchor] = useState<TipAnchor | null>(null)
  const [tipData, setTipData] = useState<TeAkaTooltipData | null>(null)
  const [tipLoading, setTipLoading] = useState(false)
  const hideTimer = useRef<number>(undefined)
  const pointerDbgCount = useRef(0)

  useEffect(() => {
    if (!anchor) {
      pointerDbgCount.current = 0
      setTipData(null)
      setTipLoading(false)
      return
    }
    setTipLoading(true)
    setTipData(null)
    let cancelled = false
    void fetchTeAkaTooltip(anchor.lemma)
      .then((d) => {
        if (!cancelled) {
          setTipData(d)
          setTipLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTipData(null)
          setTipLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [anchor])

  useEffect(() => {
    if (!anchor) return
    pointerDbgCount.current = 0
    const onCapMouseDown = (e: MouseEvent) => {
      if (pointerDbgCount.current >= 14) return
      pointerDbgCount.current += 1
      const hit = document.elementFromPoint(e.clientX, e.clientY)
      // #region agent log
      dbgMiPopover(
        'MiTeAkaInlineText.tsx:doc-capture',
        'mousedown capture elementFromPoint',
        'H6',
        {
          hitTag: hit?.nodeName ?? null,
          hitAria:
            hit instanceof HTMLElement ? hit.getAttribute('aria-label')?.slice(0, 56) : null,
          x: e.clientX,
          y: e.clientY,
        },
        'post-fix',
      )
      // #endregion
    }
    document.addEventListener('mousedown', onCapMouseDown, true)
    return () => document.removeEventListener('mousedown', onCapMouseDown, true)
  }, [anchor])

  const cancelHide = () => {
    window.clearTimeout(hideTimer.current)
  }

  const scheduleHide = () => {
    cancelHide()
    // #region agent log
    dbgMiPopover('MiTeAkaInlineText.tsx:scheduleHide', 'hide scheduled', 'H1', { delayMs: HIDE_MS })
    // #endregion
    hideTimer.current = window.setTimeout(() => {
      // #region agent log
      dbgMiPopover('MiTeAkaInlineText.tsx:hideTimer', 'anchor cleared by timer', 'H1', {})
      // #endregion
      setAnchor(null)
    }, HIDE_MS)
  }

  const openAt = (lemma: string, surfaceRaw: string, segmentIndex: number, el: HTMLElement) => {
    cancelHide()
    // #region agent log
    logTeAkaHoverDebug({
      phase: 'open',
      lemma,
      surfaceRaw,
      segmentIndex,
    })
    // #endregion
    setAnchor({
      lemma,
      surfaceRaw,
      segmentIndex,
      rect: el.getBoundingClientRect(),
    })
  }

  const registryStatusForLemma = (lemma: string): boolean | undefined => {
    if (lemmas.length === 0) return undefined
    if (presenceQuery.isPending) return undefined
    if (presenceQuery.isError) return undefined
    return knownSet?.has(lemma) ?? false
  }

  return (
    <>
      <span className={className}>
        {usePurakau ? (
          <PurakauReaderTokens
            tokens={sentenceTokens!}
            posTypes={posTypes!}
            chunkPatterns={chunkPatterns ?? []}
            connectorDesigns={connectorDesigns}
            alignedEnText={alignedEnText}
            onOpenWordPopover={(arg) => openAt(arg.lemma, arg.surfaceRaw, 0, arg.el)}
            wordSpanClassResolver={(lemma) => wordSpanClasses(registryStatusForLemma(lemma))}
          />
        ) : (
          segments.map((seg, i) =>
            seg.kind === 'text' ? (
              <span key={i}>{seg.value}</span>
            ) : (
              <span
                key={`${i}-${seg.lemma}`}
                className={wordSpanClasses(registryStatusForLemma(seg.lemma))}
                lang="mi"
                onMouseEnter={(e) => openAt(seg.lemma, seg.raw, i, e.currentTarget)}
                onMouseLeave={scheduleHide}
              >
                {seg.raw}
              </span>
            ),
          )
        )}
      </span>

      {anchor &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-auto fixed isolate z-[9999] max-h-[min(80vh,40rem)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg"
            style={{
              left: Math.max(
                8,
                Math.min(
                  anchor.rect.left,
                  typeof window !== 'undefined' ? window.innerWidth - 8 - 352 : anchor.rect.left,
                ),
              ),
              top: anchor.rect.bottom + 6,
            }}
            onPointerDown={(e) => {
              // Portal DOM is under document.body, but React still bubbles these events to the
              // Māori chunk <button> ancestor → opens edit mode / textarea. Stop bubble here.
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.stopPropagation()
            }}
            onMouseEnter={() => {
              // #region agent log
              dbgMiPopover('MiTeAkaInlineText.tsx:portal', 'pointer entered popover', 'H1', {})
              // #endregion
              cancelHide()
            }}
            onMouseLeave={() => {
              // #region agent log
              dbgMiPopover('MiTeAkaInlineText.tsx:portal', 'pointer left popover', 'H1', {})
              // #endregion
              scheduleHide()
            }}
          >
            <WordInsightPopover
              anchor={anchor}
              miChunkText={text}
              alignedEnText={alignedEnText}
              tipData={tipData}
              tipLoading={tipLoading}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
