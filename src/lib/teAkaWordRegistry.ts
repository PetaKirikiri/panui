/**
 * Minimal Te Aka lookup + `word_registry` metadata merge — mirrors Pūrākau `lookupTeAka` / `buildTeAkaMetadataPatch`
 * without importing that repo (Edge POST contract is identical).
 */

import { asciiFoldMaoriWordRegistryKey } from './miWordTokens'
import { supabase } from './supabase'

/** Browser: use Functions invoke (same networking as supabase-js; respects dev `/__supabase`). Node/scripts: bare fetch. */
const useFunctionsInvokeApi =
  typeof globalThis.window !== 'undefined' && import.meta.env.VITEST !== 'true'

export type TeAkaEntry = {
  pos: string
  definition: string
  example?: string
  exampleMi?: string
  exampleEn?: string
}

export type TeAkaResult = {
  word: string
  entries: TeAkaEntry[]
  sourceUrl: string
  audioUrl?: string | null
  wordId?: string | number | null
  scraperBuild?: string | null
}

export const TE_AKA_METADATA_KEY = 'te_aka' as const

const TE_AKA_AUDIO_BASE = 'https://storage.googleapis.com/maori-dictionary-prod2-web-assets/public'

function teAkaAudioUrlFromWordId(wordId: string | number): string {
  return `${TE_AKA_AUDIO_BASE}/${wordId}.mp3`
}

/**
 * Edge/scraper payloads sometimes include literal `&nbsp;` / NBSP. Normalize for tooltip prose.
 */
export function sanitizeTeAkaDisplayText(s: string): string {
  if (!s) return ''
  let t = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&#xa0;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u00a0/g, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

/** Same cleanup as sanitize but preserves newlines (for duplicate-headword detection). */
export function sanitizeTeAkaPreserveNewlines(s: string): string {
  if (!s) return ''
  let t = s
  t = t
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&#xa0;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u00a0/g, ' ')
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()
  return t.trimStart()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Some scrapes concatenate an English dialogue example after the gloss ("…statement. This bird …!").
 * Split at the **last** ". …This " boundary where "This …" looks like a separate sentence.
 */
export function maybeSplitEmbeddedEnglishExample(definition: string): {
  definition: string
  embeddedExample?: string
} {
  const t = sanitizeTeAkaDisplayText(definition)
  let splitAfterDot = -1
  const re = /\.\s+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t)) !== null) {
    const rest = t.slice(m.index + m[0].length)
    if (/^This\s+/i.test(rest)) splitAfterDot = m.index
  }
  if (splitAfterDot < 0) return { definition: t }
  const head = t.slice(0, splitAfterDot + 1).trim()
  const tail = t.slice(splitAfterDot + 1).trim()
  if (head.length < 15 || tail.length < 15 || tail.length > 360) return { definition: t }
  return { definition: head, embeddedExample: tail }
}

function teAkaEntryFullDefinition(definition: string): string {
  return definition
    .replace(/^\s*(?:\([^)]+\)\s*)+/, '')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Parser sometimes concatenates POS label with English with no space (e.g. "particleWhat's…").
 */
export function fixSquashedLeadingPos(definition: string, pos: string): string {
  const t = definition.trim()
  const p = pos.trim()
  if (!p || !t) return t
  const tl = t.toLowerCase()
  const pl = p.toLowerCase()
  if (!tl.startsWith(pl)) return t
  const rest = t.slice(p.length)
  if (rest.length === 0) return t
  const first = rest[0]
  if (first === ' ' || first === '(' || first === '—' || first === '-' || first === '.')
    return t
  return rest.trim()
}

/** Example English from structured fields or em-dash split on combined example line. */
export function teAkaExampleEnglishLine(ent: TeAkaEntry): string | null {
  const ex = ent.exampleEn?.trim()
  if (ex) return sanitizeTeAkaDisplayText(ex)
  const raw = ent.example?.trim()
  if (!raw) return null
  if (raw.includes('—')) {
    const tail = raw.split('—').slice(1).join('—').trim()
    return tail ? sanitizeTeAkaDisplayText(tail) : null
  }
  return sanitizeTeAkaDisplayText(raw)
}

export function teAkaExampleMiLine(ent: TeAkaEntry): string | null {
  const m = ent.exampleMi?.trim()
  if (m) return sanitizeTeAkaDisplayText(m)
  const raw = ent.example?.trim()
  if (!raw || !raw.includes('—')) return null
  const head = raw.split('—')[0]?.trim()
  return head ? sanitizeTeAkaDisplayText(head) : null
}

/** Readable definition line for tooltips (not one-letter gloss squeeze). */
export function formatTeAkaTooltipDefinition(ent: TeAkaEntry): string {
  let raw = sanitizeTeAkaDisplayText(String(ent.definition ?? ''))
  let d = teAkaEntryFullDefinition(raw)
  d = fixSquashedLeadingPos(d, ent.pos)
  if (!d.trim()) d = teAkaEntryGlossLine(ent)
  return sanitizeTeAkaDisplayText(d)
}

/** Short English gloss line — aligned with Pūrākau `teAkaEntryGlossLine`. */
export function teAkaEntryGlossLine(e: TeAkaEntry): string {
  const definitionClean = teAkaEntryFullDefinition(sanitizeTeAkaDisplayText(String(e.definition ?? '')))
  const shortGloss = definitionClean.includes(' - ') ? definitionClean.split(' - ')[0]?.trim() : null
  const exampleEnglish =
    e.exampleEn?.trim() ||
    (e.example?.includes('—') ? e.example.split('—')[1]?.trim() : null)
  return shortGloss ?? exampleEnglish ?? definitionClean
}

/** Te Aka sometimes merges two headwords spelled the same (separate lexical entries). */
export function partitionFusedLemmaBlocks(rawDefinition: string, headword: string): string[] {
  const lemma = sanitizeTeAkaDisplayText(headword).normalize('NFC').trim()
  const lemmaLc = lemma.toLowerCase()
  if (!lemmaLc || !rawDefinition || rawDefinition.trim().length < lemmaLc.length + 12) return [rawDefinition]

  const multiline = sanitizeTeAkaPreserveNewlines(rawDefinition)
  const lines = multiline.split(/\r?\n/)
  function normHeadOnly(l: string): string {
    return l.replace(/^#{1,6}\s+/, '').trim().normalize('NFC').toLowerCase()
  }
  const headIdx: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const cand = normHeadOnly(lines[i] ?? '').trim()
    if (cand === lemmaLc) headIdx.push(i)
  }

  if (headIdx.length >= 2) {
    const chunks: string[] = []
    for (let hi = 0; hi < headIdx.length; hi++) {
      const lo = headIdx[hi]
      const hiExclusive = hi + 1 < headIdx.length ? headIdx[hi + 1] : lines.length
      chunks.push(lines.slice(lo, hiExclusive).join('\n').trim())
    }
    const nonEmpty = chunks.filter(Boolean)
    if (nonEmpty.length >= 2) return nonEmpty
  }

  const oneLine = sanitizeTeAkaDisplayText(multiline.length > lemmaLc.length ? multiline : rawDefinition)
  const esc = escapeRegExp(lemmaLc)
  let cutLemmaStart = -1
  /** Fuse pattern: `\skorokē 1. (` restarting numbering after earlier senses */
  const reFusion = new RegExp(`(\\s|^)(${esc}\\s+\\d+\\.\\s*\\()`, 'giu')
  let fm: RegExpExecArray | null
  while ((fm = reFusion.exec(oneLine)) !== null) {
    const start = fm.index + (fm[1]?.length ?? 0)
    if (start < 12 || !oneLine.slice(0, start).includes('.')) continue
    cutLemmaStart = start
  }
  if (cutLemmaStart <= 8 || cutLemmaStart >= oneLine.length - 12) return [rawDefinition]

  const before = oneLine.slice(0, cutLemmaStart).trim()
  let after = oneLine.slice(cutLemmaStart).trim()
  after = after.replace(new RegExp(`^${esc}\\s+`, 'iu'), '').trim()

  if (!/\d+\.\s*\(/.test(before) || !/\d+\.\s*\(/.test(after)) return [rawDefinition]
  return [before, after]
}

/** Parse `1. (pos) gloss …` snippets from a scraped wall (synonyms/example chrome stripped). */
export function parseParenNumberedWall(segment: string): TeAkaEntry[] {
  const s = sanitizeTeAkaDisplayText(segment)
  const re = /\d+\.\s*\(([^)]*)\)/gi
  const matches = [...s.matchAll(re)] as RegExpExecArray[]
  if (matches.length === 0) return []

  const out: TeAkaEntry[] = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!
    const glossStart = m.index! + m[0].length
    const next = matches[i + 1]?.index ?? s.length
    let gloss = s.slice(glossStart, next).trim()
    gloss = gloss.replace(/\s*Synonyms:.*$/i, '').trim()
    const pos = String(m[1] ?? '').trim()
    out.push({
      pos: pos || 'sense',
      definition: gloss.length > 0 ? gloss : pos,
    })
  }
  return out
}

function stripLeadingStandaloneHead(multilineChunk: string, lemmaLc: string): string {
  const lines = multilineChunk.split(/\r?\n/)
  if (lines.length === 0) return multilineChunk
  const cand = lines[0]!.replace(/^#{1,6}\s+/, '').trim().normalize('NFC').toLowerCase()
  if (cand === lemmaLc) return lines.slice(1).join('\n').trim()
  return multilineChunk.trim()
}

function unfoldRepeatedLemmaMegarows(entries: TeAkaEntry[], headword: string): TeAkaEntry[] {
  const hw = sanitizeTeAkaDisplayText(headword).normalize('NFC').trim()
  if (!hw) return entries
  const lemmaLc = hw.toLowerCase()
  const out: TeAkaEntry[] = []
  for (const e of entries) {
    const def = String(e.definition ?? '')
    const chunks = partitionFusedLemmaBlocks(def, hw)
    if (chunks.length <= 1) {
      out.push(e)
      continue
    }
    for (const chunk of chunks) {
      let body = sanitizeTeAkaPreserveNewlines(chunk.trim())
      body = stripLeadingStandaloneHead(body, lemmaLc)
      let rows = parseParenNumberedWall(body)
      if (!rows.length) rows = parseParenNumberedWall(chunk)
      if (!rows.length) {
        out.push({ ...e, definition: sanitizeTeAkaDisplayText(body) })
      } else {
        for (const row of rows) out.push({ ...e, pos: row.pos, definition: row.definition })
      }
    }
  }
  return out
}

function dedupeTeAkaEntries(entries: TeAkaEntry[]): TeAkaEntry[] {
  const seen = new Set<string>()
  const out: TeAkaEntry[] = []
  for (const e of entries) {
    const key = [e.pos ?? '', e.definition ?? ''].join('\0')
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      pos: String(e.pos ?? ''),
      definition: String(e.definition ?? ''),
      example: e.example,
      exampleMi: e.exampleMi,
      exampleEn: e.exampleEn,
    })
  }
  return out
}

/** First gloss per POS bucket — fills `short_glosses_by_pos`. */
export function shortGlossesByPosFromEntries(entries: TeAkaEntry[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of entries) {
    const pos = String(e.pos ?? '').trim()
    if (!pos || out[pos]) continue
    const g = teAkaEntryGlossLine(e).trim()
    if (g) out[pos] = g
  }
  return out
}

export function normalizeTeAkaResultForDisplay(r: TeAkaResult): TeAkaResult {
  const expanded = unfoldRepeatedLemmaMegarows(r.entries ?? [], r.word ?? '')
  return {
    ...r,
    entries: dedupeTeAkaEntries(expanded),
  }
}

/** PATCH fragment merged into `word_registry.metadata`. */
export function buildTeAkaMetadataPatch(result: TeAkaResult): Record<string, unknown> {
  const pron =
    (typeof result.audioUrl === 'string' && result.audioUrl.trim()) ||
    (result.wordId != null && result.wordId !== ''
      ? teAkaAudioUrlFromWordId(result.wordId)
      : '')
  const patch: Record<string, unknown> = {
    [TE_AKA_METADATA_KEY]: {
      word: result.word,
      entries: dedupeTeAkaEntries(result.entries),
      sourceUrl: result.sourceUrl,
      wordId: result.wordId ?? null,
      audioUrl: result.audioUrl ?? null,
      scraperBuild: result.scraperBuild ?? null,
      fetchedAt: new Date().toISOString(),
    },
  }
  if (pron) patch.pronunciation_url = pron
  if (result.wordId != null && String(result.wordId).trim() !== '') {
    patch.te_aka_word_id = String(result.wordId)
  }
  return patch
}

function mergeMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = existing && typeof existing === 'object' ? { ...existing } : {}
  for (const [k, v] of Object.entries(patch)) {
    base[k] = v
  }
  return base
}

/** Shared envelope handling after JSON is parsed or returned from functions.invoke(). */
function finishTeAkaEnvelopePayload(
  searchUsed: string,
  dataIn: TeAkaResult | { error?: string } | null | undefined,
  resStatus: number,
  httpOk: boolean,
): TeAkaResult | null {
  let data = dataIn as TeAkaResult | { error?: string } | null | undefined
  if (!data || typeof data !== 'object') {
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
        hypothesisId: 'H2-emptyBody',
        location: 'teAkaWordRegistry.ts:lookupTeAkaEdge:emptyBody',
        message: 'lookup-te-aka empty or non-object body',
        data: { word: searchUsed, status: resStatus, invokePath: useFunctionsInvokeApi },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    if (import.meta.env?.DEV) console.warn('[lookup-te-aka] empty body', resStatus)
    return null
  }
  if (!httpOk || 'error' in data) {
    if (import.meta.env?.DEV) {
      console.warn('[lookup-te-aka] request failed', {
        status: resStatus,
        word: searchUsed,
        body: data,
      })
    }
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
        hypothesisId: 'H2-http',
        location: 'teAkaWordRegistry.ts:lookupTeAkaEdge:fail',
        message: 'lookup-te-aka non-ok or error payload',
        data: {
          word: searchUsed,
          status: resStatus,
          ok: httpOk,
          hasErrorKey: typeof data === 'object' && data != null && 'error' in data,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return null
  }
  const raw = data as TeAkaResult
  const rawN = raw.entries?.length ?? 0
  const normalized = normalizeTeAkaResultForDisplay(raw)
  const n = normalized.entries?.length ?? 0
  // #region agent log
  fetch('http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '9af2a9',
    },
    body: JSON.stringify({
      sessionId: '9af2a9',
      runId: 'post-fix',
      hypothesisId: 'H3-normalize',
      location: 'teAkaWordRegistry.ts:lookupTeAkaEdge:ok',
      message: 'edge ok entries before/after normalize',
      data: {
        word: searchUsed,
        rawEntryCount: rawN,
        normalizedEntryCount: n,
        status: resStatus,
        invokePath: useFunctionsInvokeApi,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  if (import.meta.env?.DEV && n === 0) {
    console.warn('[lookup-te-aka] no entries after normalize', {
      word: searchUsed,
      keys: typeof data === 'object' && data != null ? Object.keys(data) : [],
    })
  }
  return normalized
}

/**
 * POST `/functions/v1/lookup-te-aka` with anon key (same contract as Pūrākau).
 * Retries once with macrons stripped — some Edge builds only match lemmas without tohutō.
 */
export async function lookupTeAkaEdge(
  supabaseUrl: string,
  anonKey: string,
  word: string,
): Promise<TeAkaResult | null> {
  const qPrimary = word.trim().normalize('NFC').toLowerCase()
  if (!qPrimary || !anonKey.trim()) {
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
        hypothesisId: 'H1-skip-edge',
        location: 'teAkaWordRegistry.ts:lookupTeAkaEdge:noop',
        message: 'lookupTeAka skipped empty word or anon',
        data: { emptyWord: !qPrimary, anonEmpty: !anonKey.trim() },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return null
  }
  const base = supabaseUrl.replace(/\/$/, '')
  const url = `${base}/functions/v1/lookup-te-aka`

  async function attemptLookup(searchUsed: string): Promise<TeAkaResult | null> {
    try {
      if (useFunctionsInvokeApi) {
        const inv = await supabase.functions.invoke<
          TeAkaResult | { error?: string }
        >('lookup-te-aka', { body: { word: searchUsed } })

        // #region agent log
        fetch('http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': '9af2a9',
          },
          body: JSON.stringify({
            sessionId: '9af2a9',
            runId: 'post-fix',
            hypothesisId: 'H9-invoke',
            location: 'teAkaWordRegistry.ts:lookupTeAkaEdge:invokeSdk',
            message: 'functions.invoke lookup-te-aka completed',
            data: {
              word: searchUsed,
              hasFnError: !!inv.error,
              fnErrMsg:
                inv.error && 'message' in inv.error ? String(inv.error.message).slice(0, 160) : null,
              dataKind: inv.data === null ? 'null' : typeof inv.data,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion

        if (inv.error) {
          if (import.meta.env?.DEV) console.warn('[lookup-te-aka] functions.invoke failed', inv.error)
          return null
        }
        return finishTeAkaEnvelopePayload(searchUsed, inv.data ?? null, 200, true)
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ word: searchUsed }),
      })
      const text = await res.text()
      let data: TeAkaResult | { error?: string } | null = null
      try {
        data = text.trim() ? (JSON.parse(text) as TeAkaResult | { error?: string }) : null
      } catch {
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
            hypothesisId: 'H2-json',
            location: 'teAkaWordRegistry.ts:lookupTeAkaEdge:badJson',
            message: 'lookup-te-aka invalid json',
            data: {
              word: searchUsed,
              status: res.status,
              textLen: text.length,
              snippetPreview: text.slice(0, 120),
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        if (import.meta.env?.DEV) {
          console.warn('[lookup-te-aka] invalid JSON', { status: res.status, snippet: text.slice(0, 160) })
        }
        return null
      }

      return finishTeAkaEnvelopePayload(searchUsed, data, res.status, res.ok)
    } catch (e) {
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
          hypothesisId: 'H8-throw',
          location: 'teAkaWordRegistry.ts:lookupTeAkaEdge:attemptCatch',
          message: 'lookup-te-aka attempt threw',
          data: {
            word: searchUsed,
            err: e instanceof Error ? e.message : String(e),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      if (import.meta.env?.DEV) {
        console.warn('[lookup-te-aka] fetch error', {
          word: searchUsed,
          url,
          message: e instanceof Error ? e.message : e,
        })
      }
      return null
    }
  }

  const first = await attemptLookup(qPrimary)
  if ((first?.entries?.length ?? 0) > 0) return first

  const folded = asciiFoldMaoriWordRegistryKey(qPrimary)
  const didFoldRetry = folded !== qPrimary && folded.length >= 2
  let secondAttempt: TeAkaResult | null = null

  if (didFoldRetry) {
    secondAttempt = await attemptLookup(folded)
    if ((secondAttempt?.entries?.length ?? 0) > 0) {
      // #region agent log
      fetch('http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '9af2a9',
        },
        body: JSON.stringify({
          sessionId: '9af2a9',
          runId: 'post-fix',
          hypothesisId: 'HF-fold-retry',
          location: 'teAkaWordRegistry.ts:lookupTeAkaEdge:asciiRetryHit',
          message: 'Te Aka edge filled after ascii-fold retry',
          data: {
            primary: qPrimary,
            folded,
            secondEntryCount: secondAttempt!.entries.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      return secondAttempt
    }
  }

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
      hypothesisId: 'HG-null',
      location: 'teAkaWordRegistry.ts:lookupTeAkaEdge:noEntries',
      message: 'lookup-te-aka yielded no usable entries after NFC + fold',
      data: {
        qPrimary,
        folded,
        didFoldRetry,
        firstIsNull: first === null,
        firstEntryLen: first?.entries?.length ?? null,
        secondAttemptIsNull: didFoldRetry ? secondAttempt === null : null,
        secondEntryLen:
          didFoldRetry && secondAttempt != null ? (secondAttempt.entries?.length ?? 0) : null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  return null
}

/** Row update payload: merged metadata + derived gloss map (does not clear unrelated metadata keys). */
export function buildWordRegistryTeAkaUpdate(
  existingMetadata: unknown,
  result: TeAkaResult,
): { metadata: Record<string, unknown>; short_glosses_by_pos: Record<string, string> } {
  const patch = buildTeAkaMetadataPatch(result)
  const entries = dedupeTeAkaEntries(result.entries ?? [])
  const gloss = shortGlossesByPosFromEntries(entries)
  const meta = mergeMetadata(
    existingMetadata && typeof existingMetadata === 'object'
      ? (existingMetadata as Record<string, unknown>)
      : {},
    patch,
  )
  return { metadata: meta, short_glosses_by_pos: gloss }
}
