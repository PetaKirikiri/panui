import { supabase } from './supabase'
import type { ReadingBatch } from '../content/schema'
import type { SentenceToken } from '../db/schema'
import type { ChunkPatternInput } from './patternMatch'
import type { PosTypeLike } from './tokens'
import type { ConnectorDesignLike } from './purakauReaderTypes'

type SentenceRow = {
  chapter_number: number | null
  page_number: number | null
  paragraph_number: number | null
  chunk_index: number | null
  sentence_number: number | null
  sentence_text: string
  tokens_array?: unknown
}

/** PostgREST may return `numeric` columns as strings — coerce for comparisons. */
function numField(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export type StoryReaderPayload = {
  titleName: string | null
  versionLabel: string | null
  batches: ReadingBatch[]
  posTypes: PosTypeLike[]
  chunkPatterns: ChunkPatternInput[]
  connectorDesigns: ConnectorDesignLike[]
}

/** Chapter/page keys are embedded in {@link ReadingBatch.id} as `…-{chapter}:{page}`. */
export function parseReaderBatchChapterPage(batch: ReadingBatch): {
  chapter: number
  page: number
} {
  const m = batch.id.match(/-(\d+):(\d+)$/)
  if (!m) return { chapter: 0, page: 0 }
  return { chapter: Number.parseInt(m[1], 10), page: Number.parseInt(m[2], 10) }
}

export type SidebarChapterRow = {
  chapterNumber: number
  firstBatchIndex: number
  previewLabel?: string
}

/** One row per distinct chapter; link targets the first batch for that chapter in reader order. */
export function distinctChaptersForSidebar(batches: ReadingBatch[]): SidebarChapterRow[] {
  const map = new Map<number, { minIdx: number; label?: string }>()
  batches.forEach((batch, idx) => {
    const { chapter } = parseReaderBatchChapterPage(batch)
    const cur = map.get(chapter)
    if (!cur || idx < cur.minIdx) {
      map.set(chapter, { minIdx: idx, label: batch.label })
    }
  })
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([chapterNumber, { minIdx, label }]) => ({
      chapterNumber,
      firstBatchIndex: minIdx,
      previewLabel: label,
    }))
}

function chapterPageKey(ch: number | null, pg: number | null): string {
  const c = ch ?? 0
  const p = pg ?? 0
  return `${c}:${p}`
}

function parseKey(key: string): { chapter: number; page: number } {
  const [a, b] = key.split(':').map(Number)
  return { chapter: Number.isFinite(a) ? a : 0, page: Number.isFinite(b) ? b : 0 }
}

function rowsForChapterPage(rows: SentenceRow[], chapter: number, page: number): SentenceRow[] {
  return rows.filter(
    (r) => (r.chapter_number ?? 0) === chapter && (r.page_number ?? 0) === page,
  )
}

function rowChunkIndex(r: SentenceRow): number {
  const c = numField(r.chunk_index)
  if (c != null) return c
  const p = r.paragraph_number ?? 1
  return Math.max(0, p - 1)
}

function rowsToParagraphs(rows: SentenceRow[]): string[] {
  const byChunk = new Map<number, SentenceRow[]>()
  for (const r of rows) {
    const kn = rowChunkIndex(r)
    const list = byChunk.get(kn) ?? []
    list.push(r)
    byChunk.set(kn, list)
  }
  const chunkKeys = [...byChunk.keys()].sort((a, b) => a - b)
  return chunkKeys.map((kn) => {
    const rs = (byChunk.get(kn) ?? []).sort(
      (a, b) => (a.sentence_number ?? 0) - (b.sentence_number ?? 0),
    )
    return rs.map((r) => r.sentence_text).join(' ')
  })
}

/** Parse tokens_array JSON — tolerate partial rows from PostgREST. */
export function parseTokensArrayJson(raw: unknown): SentenceToken[] {
  if (!Array.isArray(raw)) return []
  const out: SentenceToken[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const text = String(o.text ?? '')
    const pid = o.pos_type_id
    const wid = o.word_pos_entry_id
    const pos_type_id =
      typeof pid === 'number' ? pid : pid != null && String(pid).trim() !== '' ? Number(pid) : null
    const word_pos_entry_id =
      typeof wid === 'number' ? wid : wid != null && String(wid).trim() !== '' ? Number(wid) : null
    out.push({
      index: typeof o.index === 'number' ? o.index : out.length + 1,
      text,
      pos_type_id: Number.isFinite(pos_type_id as number) ? (pos_type_id as number) : null,
      word_pos_entry_id: Number.isFinite(word_pos_entry_id as number)
        ? (word_pos_entry_id as number)
        : null,
    })
  }
  return out
}

function mergeSentenceTokenRows(sortedRows: SentenceRow[]): SentenceToken[] {
  const sorted = [...sortedRows].sort((a, b) => (a.sentence_number ?? 0) - (b.sentence_number ?? 0))
  let seq = 0
  const acc: SentenceToken[] = []
  for (let i = 0; i < sorted.length; i++) {
    const tk = parseTokensArrayJson(sorted[i].tokens_array)
    if (i > 0 && acc.length > 0 && tk.length > 0) {
      seq++
      acc.push({
        index: seq,
        text: ' ',
        pos_type_id: null,
        word_pos_entry_id: null,
      })
    }
    for (const t of tk) {
      seq++
      acc.push({ ...t, index: seq })
    }
  }
  return acc
}

/** One merged token stream per paragraph (matches `rowsToParagraphs` grouping). */
function rowsToMiTokensByParagraph(rows: SentenceRow[]): SentenceToken[][] {
  const byChunk = new Map<number, SentenceRow[]>()
  for (const r of rows) {
    const kn = rowChunkIndex(r)
    const list = byChunk.get(kn) ?? []
    list.push(r)
    byChunk.set(kn, list)
  }
  const chunkKeys = [...byChunk.keys()].sort((a, b) => a - b)
  return chunkKeys.map((kn) => {
    const rs = (byChunk.get(kn) ?? []).sort(
      (a, b) => (a.sentence_number ?? 0) - (b.sentence_number ?? 0),
    )
    return mergeSentenceTokenRows(rs)
  })
}

async function fetchSentencesForSource(sourceId: number): Promise<SentenceRow[]> {
  const { data, error } = await supabase
    .from('story_sentences')
    .select(
      'chapter_number, page_number, paragraph_number, chunk_index, sentence_number, sentence_text, tokens_array',
    )
    .eq('story_source_id', sourceId)
    .order('chapter_number', { ascending: true })
    .order('page_number', { ascending: true })
    .order('chunk_index', { ascending: true })
    .order('paragraph_number', { ascending: true })
    .order('sentence_number', { ascending: true })

  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map((raw) => ({
    chapter_number: numField(raw.chapter_number),
    page_number: numField(raw.page_number),
    paragraph_number: numField(raw.paragraph_number),
    chunk_index: numField(raw.chunk_index),
    sentence_number: numField(raw.sentence_number),
    sentence_text: String(raw.sentence_text ?? ''),
    tokens_array: raw.tokens_array,
  }))
}

async function fetchReaderAnnotationTables(): Promise<{
  posTypes: PosTypeLike[]
  chunkPatterns: ChunkPatternInput[]
  connectorDesigns: ConnectorDesignLike[]
}> {
  const [pt, pc, cd] = await Promise.all([
    supabase.from('pos_types').select('id, label, color').order('id', { ascending: true }),
    supabase.from('pos_chunk_patterns').select('id, name, pos_pattern, presentation'),
    supabase.from('connector_designs').select('pos_type_id, side, shape_config'),
  ])
  if (pt.error) throw pt.error
  if (pc.error) throw pc.error
  if (cd.error) throw cd.error

  const posTypes: PosTypeLike[] = (pt.data ?? []).map((r) => ({
    id: Number(r.id),
    label: r.label ?? '',
    color: r.color ?? null,
  }))

  const chunkPatterns: ChunkPatternInput[] = (pc.data ?? []).map((r) => ({
    id: Number(r.id),
    name: r.name ?? '',
    sequence: ((r.pos_pattern as { sequence?: number[] })?.sequence ?? []) as number[],
    presentation: (r.presentation ?? null) as ChunkPatternInput['presentation'],
  }))

  const connectorDesigns: ConnectorDesignLike[] = (cd.data ?? []).map((r) => ({
    pos_type_id: Number(r.pos_type_id),
    side: String(r.side ?? ''),
    shape_config: r.shape_config,
  }))

  return { posTypes, chunkPatterns, connectorDesigns }
}

export async function fetchStoryReaderPayload(
  titleId: number,
  versionId: number,
): Promise<StoryReaderPayload> {
  const [{ data: titleRow, error: titleErr }, { data: rawVer, error: verErr }] = await Promise.all([
    supabase.from('titles').select('name').eq('id', titleId).maybeSingle(),
    supabase
      .from('story_versions')
      .select('label, version_number')
      .eq('id', versionId)
      .maybeSingle(),
  ])

  if (titleErr) throw titleErr
  if (verErr) throw verErr

  const metaVer = rawVer as { label?: string | null; version_number?: number | null } | null
  const versionLabel =
    metaVer?.label != null
      ? `${metaVer.label}${metaVer.version_number != null ? ` (${metaVer.version_number})` : ''}`
      : null

  const { data: sources, error: srcErr } = await supabase
    .from('story_sources')
    .select('id, language')
    .eq('title_id', titleId)
    .eq('version_id', versionId)
    .in('language', ['en', 'mi'])

  if (srcErr) throw srcErr

  const enSource = sources?.find((s) => s.language === 'en')
  const miSource = sources?.find((s) => s.language === 'mi')

  const [[enRows, miRows], annotation] = await Promise.all([
    Promise.all([
      enSource ? fetchSentencesForSource(enSource.id) : Promise.resolve([] as SentenceRow[]),
      miSource ? fetchSentencesForSource(miSource.id) : Promise.resolve([] as SentenceRow[]),
    ]),
    fetchReaderAnnotationTables(),
  ])

  const pageKeys = new Set<string>()
  for (const r of [...enRows, ...miRows]) {
    pageKeys.add(chapterPageKey(r.chapter_number, r.page_number))
  }

  const sortedKeys = [...pageKeys].sort((a, b) => {
    const A = parseKey(a)
    const B = parseKey(b)
    return A.chapter - B.chapter || A.page - B.page
  })

  const batches: ReadingBatch[] = sortedKeys.map((key, index) => {
    const { chapter, page } = parseKey(key)
    const enPart = rowsToParagraphs(rowsForChapterPage(enRows, chapter, page))
    const miPageRows = rowsForChapterPage(miRows, chapter, page)
    const miPart = rowsToParagraphs(miPageRows)
    const miTokByPara = rowsToMiTokensByParagraph(miPageRows)
    const hasTagged = miTokByPara.some((t) => t.length > 0)
    const label =
      chapter > 0 ? `Chapter ${chapter} · Page ${page}` : page > 0 ? `Page ${page}` : undefined
    return {
      id: `t${titleId}-v${versionId}-${key}`,
      order: index + 1,
      label,
      english: enPart.length ? enPart : [''],
      maori: miPart.length ? miPart : [''],
      ...(hasTagged ? { miTokens: miTokByPara } : {}),
    }
  })

  return {
    titleName: titleRow?.name ?? null,
    versionLabel,
    batches,
    posTypes: annotation.posTypes,
    chunkPatterns: annotation.chunkPatterns,
    connectorDesigns: annotation.connectorDesigns,
  }
}
