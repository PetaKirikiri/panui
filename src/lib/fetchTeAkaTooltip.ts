import { supabase, getSupabaseRestBaseUrl } from './supabase'
import {
  TE_AKA_METADATA_KEY,
  type TeAkaEntry,
  type TeAkaResult,
  buildWordRegistryTeAkaUpdate,
  lookupTeAkaEdge,
} from './teAkaWordRegistry'
import { normalizeWordRegistrySurface } from './miWordTokens'
import { queryClient } from './queryClient'

const DEBUG_TE_AKA_HOOK =
  Boolean(import.meta.env?.DEV) ||
  (typeof import.meta.env.VITE_DEBUG_TE_AKA_HOVER === 'string' &&
    import.meta.env.VITE_DEBUG_TE_AKA_HOVER.trim() === '1')

const DBG_INGEST = 'http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db'
const DBG_SESSION = 'e1a103'

function logTeAkaHoverDebug(data: Record<string, unknown>): void {
  if (!DEBUG_TE_AKA_HOOK) return
  void fetch(DBG_INGEST, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': DBG_SESSION,
    },
    body: JSON.stringify({
      sessionId: DBG_SESSION,
      hypothesisId: 'hover-te-aka',
      location: 'fetchTeAkaTooltip.ts:teAkaHoverSummary',
      message: 'Te Aka hover: page entry vs pull vs save',
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {})
}

export { logTeAkaHoverDebug }
/** One sense row — same shape as Edge `entries[]`; tooltip renders definition vs examples separately. */
export type TeAkaTooltipEntry = {
  pos: string
  definition: string
  example?: string
  exampleMi?: string
  exampleEn?: string
}

export type TeAkaTooltipData = {
  lemma: string
  sourceUrl?: string
  entries: TeAkaTooltipEntry[]
}

function entriesFromTeAkaShape(entries: unknown): TeAkaTooltipEntry[] {
  if (!Array.isArray(entries)) return []
  const out: TeAkaTooltipEntry[] = []
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue
    const ent = e as TeAkaEntry
    const pos = String(ent.pos ?? '').trim()
    const definition = String(ent.definition ?? '')
    const example = typeof ent.example === 'string' ? ent.example : undefined
    const exampleMi = typeof ent.exampleMi === 'string' ? ent.exampleMi : undefined
    const exampleEn = typeof ent.exampleEn === 'string' ? ent.exampleEn : undefined
    if (!definition.trim() && !example?.trim() && !exampleMi?.trim() && !exampleEn?.trim() && !pos)
      continue
    out.push({ pos, definition, example, exampleMi, exampleEn })
  }
  return out
}

function fromRegistryMetadata(
  lemma: string,
  meta: Record<string, unknown> | null | undefined,
  shortGloss?: Record<string, string> | null,
): TeAkaTooltipData | null {
  const te = meta?.[TE_AKA_METADATA_KEY] as
    | { entries?: unknown; sourceUrl?: unknown }
    | undefined
  const entries = entriesFromTeAkaShape(te?.entries)
  if (entries.length > 0) {
    return {
      lemma,
      sourceUrl: typeof te?.sourceUrl === 'string' ? te.sourceUrl : undefined,
      entries,
    }
  }
  if (shortGloss && typeof shortGloss === 'object') {
    const pairs = Object.entries(shortGloss).filter(([, v]) => String(v).trim())
    if (pairs.length > 0) {
      return {
        lemma,
        entries: pairs.map(([pos, gloss]) => ({
          pos,
          definition: String(gloss),
        })),
      }
    }
  }
  return null
}

function fromTeAkaResult(lemma: string, r: TeAkaResult): TeAkaTooltipData | null {
  const entries = entriesFromTeAkaShape(r.entries)
  if (entries.length === 0) return null
  return {
    lemma: r.word || lemma,
    sourceUrl: r.sourceUrl,
    entries,
  }
}

/** @returns whether row upsert succeeded */
async function upsertWordRegistryFromTeAka(key: string, result: TeAkaResult): Promise<boolean> {
  const { metadata, short_glosses_by_pos } = buildWordRegistryTeAkaUpdate({}, result)
  const { error } = await supabase.from('word_registry').upsert(
    {
      word_text: key,
      language: 'mi',
      pos_types: [],
      metadata,
      short_glosses_by_pos,
    },
    { onConflict: 'word_text' },
  )
  if (error) {
    console.warn('[word_registry] upsert after Te Aka:', error.message)
    return false
  }
  await queryClient.invalidateQueries({ queryKey: ['wordRegistryPresence'] })
  return true
}

async function loadTooltip(lemma: string): Promise<TeAkaTooltipData | null> {
  const key = normalizeWordRegistrySurface(lemma)
  if (key.length < 2) return null

  const anon =
    typeof import.meta.env.VITE_SUPABASE_ANON_KEY === 'string'
      ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim()
      : ''

  const edgeAttempted = Boolean(anon)
  let edgeFirst: TeAkaResult | null = null
  if (anon) {
    edgeFirst = await lookupTeAkaEdge(getSupabaseRestBaseUrl(), anon, key)
  }

  const edgeEnvelopeReceived = edgeFirst !== null
  const edgeRawEntryCount = edgeFirst?.entries?.length ?? 0
  const teAkaPageHasEntry = edgeRawEntryCount > 0
  const edgePullFailed = edgeAttempted && !edgeEnvelopeReceived

  if (edgeRawEntryCount > 0) {
    const fromEdge = edgeFirst ? fromTeAkaResult(key, edgeFirst) : null
    if (fromEdge && edgeFirst) {
      const registrySaveOk = await upsertWordRegistryFromTeAka(key, edgeFirst)
      logTeAkaHoverDebug({
        key,
        fromSessionCache: false,
        edgeAttempted,
        edgeEnvelopeReceived,
        edgePullFailed,
        teAkaPageHasEntry,
        edgeRawEntryCount,
        registrySaveAttempted: true,
        registrySaveOk,
        resultSource: 'edge',
        tooltipRowCount: fromEdge.entries.length,
      })
      return fromEdge
    }
    logTeAkaHoverDebug({
      key,
      fromSessionCache: false,
      edgeAttempted,
      edgeEnvelopeReceived,
      edgePullFailed,
      teAkaPageHasEntry,
      edgeRawEntryCount,
      registrySaveAttempted: false,
      registrySaveOk: null,
      resultSource: 'edge_tooltip_filter_empty',
      tooltipRowCount: 0,
      note: 'Edge had raw entries but entriesFromTeAkaShape produced zero tooltip rows',
    })
  }

  const { data, error } = await supabase
    .from('word_registry')
    .select('metadata, short_glosses_by_pos')
    .eq('word_text', key)
    .maybeSingle()

  if (!error && data) {
    const row = data as { metadata?: unknown; short_glosses_by_pos?: unknown }
    const meta =
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : undefined
    const glossMap =
      row.short_glosses_by_pos && typeof row.short_glosses_by_pos === 'object'
        ? (row.short_glosses_by_pos as Record<string, string>)
        : null
    const fromRow = fromRegistryMetadata(key, meta, glossMap)
    if (fromRow) {
      logTeAkaHoverDebug({
        key,
        fromSessionCache: false,
        edgeAttempted,
        edgeEnvelopeReceived,
        edgePullFailed,
        teAkaPageHasEntry,
        edgeRawEntryCount,
        registrySaveAttempted: false,
        registrySaveOk: null,
        resultSource: 'registry',
        tooltipRowCount: fromRow.entries.length,
        registrySelectErr: null,
      })
      return fromRow
    }
  }

  logTeAkaHoverDebug({
    key,
    fromSessionCache: false,
    edgeAttempted,
    edgeEnvelopeReceived,
    edgePullFailed,
    teAkaPageHasEntry,
    edgeRawEntryCount,
    registrySaveAttempted: false,
    registrySaveOk: null,
    resultSource: 'none',
    tooltipRowCount: 0,
    registrySelectErr: error?.message ?? null,
  })

  return null
}

const hitCache = new Map<string, TeAkaTooltipData | null>()
const inflight = new Map<string, Promise<TeAkaTooltipData | null>>()

/**
 * Tooltip payload for a Māori lemma: live Edge `lookup-te-aka` first, then `word_registry` cache fallback.
 * Caches results per lemma for the session.
 */
export function fetchTeAkaTooltip(lemma: string): Promise<TeAkaTooltipData | null> {
  const key = normalizeWordRegistrySurface(lemma)
  if (key.length < 2) return Promise.resolve(null)

  if (hitCache.has(key)) {
    const cached = hitCache.get(key)!
    logTeAkaHoverDebug({
      key,
      fromSessionCache: true,
      edgeAttempted: null,
      edgeEnvelopeReceived: null,
      edgePullFailed: null,
      teAkaPageHasEntry: (cached?.entries?.length ?? 0) > 0,
      edgeRawEntryCount: null,
      registrySaveAttempted: null,
      registrySaveOk: null,
      resultSource: 'session_memory_cache',
      tooltipRowCount: cached?.entries?.length ?? 0,
      note: 'No network; lemma was cached earlier in this tab',
    })
    return Promise.resolve(cached)
  }

  let p = inflight.get(key)
  if (!p) {
    p = loadTooltip(key).then((r) => {
      // Do not cache failed or empty tooltips — a bad first attempt (e.g. before Edge deploy)
      // would otherwise stick for the whole tab (see session_memory_cache in debug logs).
      if (r != null && r.entries.length > 0) {
        hitCache.set(key, r)
      }
      return r
    })
    void p.finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  return p
}
