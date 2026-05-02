/**
 * Fetch + parse Te Aka (maoridictionary.co.nz) word pages for {@link lookup-te-aka} Edge
 * and for unit tests.
 *
 * **Slug miss:** `/word/whakahi` (no macron) is often a “We couldn't find that” page while the site
 * search still lists `whakahī`. We then follow the first search result’s numeric `/word/{id}` URL.
 */
import type { TeAkaEntry, TeAkaResult } from './teAkaWordRegistry'

const SITE_ORIGIN = 'https://maoridictionary.co.nz'

const TE_AKA_FETCH_HEADERS: HeadersInit = {
  Accept: 'text/html,application/xhtml+xml',
  'User-Agent': 'Mozilla/5.0 (compatible; PanuiTeAkaScrape/1.0; +https://github.com/)',
}

/** Exported for tests — first “permalink” in search results (`title="Link to this word"`). */
export function extractFirstCanonicalWordUrlFromSearchHtml(html: string): string | null {
  const m = html.match(
    /href="(https:\/\/maoridictionary\.co\.nz\/word\/\d+)"\s+title="Link to this word"/i,
  )
  return m?.[1] ?? null
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** First gloss paragraph: `<p class="mb-0">` only (not `mb-0 mt-2` example lines). Te Aka often omits `</p>` before a following `<div>`. */
function extractGlossParagraphHtml(detailInner: string): string | null {
  const stopAtMt4 = detailInner.match(/<p class="mb-0"\s*>([\s\S]*?)(?=<div\s+class="mt-4\b)/i)
  if (stopAtMt4?.[1]) return stopAtMt4[1].trim()

  /** Short entries use `class=""` wrapper instead of `mt-4` (e.g. /word/wai). */
  const stopAtAnyDiv = detailInner.match(/<p class="mb-0"\s*>([\s\S]*?)(?=<div\b)/i)
  if (stopAtAnyDiv?.[1]?.trim()) return stopAtAnyDiv[1].trim()

  const closed = detailInner.match(/<p class="mb-0"\s*>([\s\S]*?)<\/p>/i)
  return closed?.[1]?.trim() ?? null
}

/** Māori / English example: <em>…</em> / … */
function extractExampleMiEn(detailInner: string): { mi: string; en: string } | null {
  const m = detailInner.match(/<em>([\s\S]*?)<\/em>\s*\/\s*([^<]+)/i)
  if (!m) return null
  const mi = stripHtmlToText(m[1] ?? '')
  const en = stripHtmlToText(m[2] ?? '')
  if (mi.length < 2 || en.length < 2) return null
  return { mi, en }
}

/**
 * Sense line text looks like: `1. (verb) (-a) to swallow, devour, …`
 */
function glossParagraphToEntry(glossPlain: string): TeAkaEntry | null {
  const t = glossPlain.trim()
  const m = t.match(/^(\d+)\.\s*\(([^)]*)\)\s*(.+)$/su)
  if (!m) return null
  const pos = String(m[2] ?? '').trim()
  const definition = String(m[3] ?? '').trim()
  if (!pos && !definition) return null
  return {
    pos: pos || 'sense',
    definition: definition.length > 0 ? definition : pos,
  }
}

function extractWordId(html: string): string | null {
  const a = html.match(/word-audio-(\d+)/)
  if (a?.[1]) return a[1]
  const b = html.match(/maori-dictionary-prod2-web-assets\/public\/(\d+)\.mp3/)
  return b?.[1] ?? null
}

function extractHeadwordFromH2(html: string): string | null {
  const m = html.match(/<h2 class="title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)
  if (!m?.[1]) return null
  const w = stripHtmlToText(m[1]).split(/\s+/)[0]?.trim()
  return w ? w.normalize('NFC').toLowerCase() : null
}

const DETAIL_OPEN = '<div class="flex-1 detail">'

/** Inner HTML of `.flex-1.detail` (balanced `</div>`), starting search at `fromIndex`. */
function extractDetailInnerHtml(html: string, fromIndex: number): string | null {
  const open = html.indexOf(DETAIL_OPEN, fromIndex)
  if (open < 0) return null
  const innerStart = open + DETAIL_OPEN.length
  let i = innerStart
  let depth = 1
  while (i < html.length && depth > 0) {
    const divOpen = html.indexOf('<div', i)
    const divClose = html.indexOf('</div>', i)
    if (divClose < 0) return null
    if (divOpen >= 0 && divOpen < divClose) {
      depth++
      i = divOpen + 4
    } else {
      depth--
      if (depth === 0) return html.slice(innerStart, divClose)
      i = divClose + 6
    }
  }
  return null
}

/**
 * Parse server-rendered HTML from `GET /word/{lemma}`.
 */
export function parseMaoridictionaryWordPageHtml(html: string, lemma: string): TeAkaResult | null {
  const lc = lemma.trim().normalize('NFC').toLowerCase()
  if (!lc || !html.includes('content-def')) return null

  /** Search zero-hit page uses this heading near the top */
  if (/We couldn't find that/i.test(html) && !/<div class="flex-1 detail">/i.test(html)) {
    return null
  }

  const wordId = extractWordId(html)
  const headword = extractHeadwordFromH2(html) ?? lc
  const sourceUrl = `${SITE_ORIGIN}/word/${encodeURIComponent(lc)}`

  const entries: TeAkaEntry[] = []
  let pos = 0
  while (pos < html.length) {
    const d = html.indexOf('<div id="d', pos)
    if (d < 0) break
    const tagEnd = html.indexOf('>', d)
    if (tagEnd < 0) break
    const tag = html.slice(d, tagEnd + 1)
    if (!/^<div id="d\d+"/i.test(tag)) {
      pos = d + 1
      continue
    }
    const inner = extractDetailInnerHtml(html, d)
    pos = tagEnd + 1
    if (!inner) continue

    const glossHtml = extractGlossParagraphHtml(inner)
    if (!glossHtml) continue
    const glossPlain = stripHtmlToText(glossHtml)
    const ent = glossParagraphToEntry(glossPlain)
    if (!ent) continue

    const ex = extractExampleMiEn(inner)
    if (ex) {
      ent.exampleMi = ex.mi
      ent.exampleEn = ex.en
      ent.example = `${ex.mi} — ${ex.en}`
    }
    entries.push(ent)
  }

  if (entries.length === 0) return null

  const audioUrl = wordId
    ? `https://storage.googleapis.com/maori-dictionary-prod2-web-assets/public/${wordId}.mp3`
    : null

  return {
    word: headword,
    entries,
    sourceUrl,
    wordId: wordId ?? null,
    audioUrl,
    scraperBuild: 'panui-maoridictionary-scrape-v1',
  }
}

export async function fetchMaoridictionaryWordPage(lemma: string): Promise<string | null> {
  const lc = lemma.trim().normalize('NFC').toLowerCase()
  if (!lc) return null
  const url = `${SITE_ORIGIN}/word/${encodeURIComponent(lc)}`
  return fetchMaoridictionaryUrl(url)
}

async function fetchMaoridictionaryUrl(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: TE_AKA_FETCH_HEADERS })
  if (!res.ok) return null
  return await res.text()
}

async function fetchMaoridictionarySearchPage(keywords: string): Promise<string | null> {
  const q = keywords.trim().normalize('NFC').toLowerCase()
  if (!q) return null
  return fetchMaoridictionaryUrl(`${SITE_ORIGIN}/search?keywords=${encodeURIComponent(q)}`)
}

function isTeAkaSlugMissPage(html: string): boolean {
  return (
    /We couldn't find that/i.test(html) && !/<div class="flex-1 detail">/i.test(html)
  )
}

/** Full lookup: `/word/{lemma}`; on Te Aka slug miss, search + follow first result `/word/{id}`. */
export async function scrapeTeAkaMaoridictionaryLemma(lemma: string): Promise<TeAkaResult | null> {
  const rawLemma = lemma.trim()
  const lc = rawLemma.normalize('NFC').toLowerCase()
  if (!lc) return null

  const primaryHtml = await fetchMaoridictionaryWordPage(lc)
  if (!primaryHtml) return null

  let result = parseMaoridictionaryWordPageHtml(primaryHtml, rawLemma)
  if (result?.entries?.length) {
    // #region agent log
    void fetch('http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'e1a103',
      },
      body: JSON.stringify({
        sessionId: 'e1a103',
        hypothesisId: 'H-direct-slash-word',
        location: 'teAkaMaoridictionaryScrape.ts:scrapeTeAkaMaoridictionaryLemma',
        message: 'Te Aka parse ok from direct /word/{lemma}',
        data: { lemma: lc, entryCount: result.entries.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return result
  }

  if (!isTeAkaSlugMissPage(primaryHtml)) {
    // #region agent log
    void fetch('http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'e1a103',
      },
      body: JSON.stringify({
        sessionId: 'e1a103',
        hypothesisId: 'H-empty-not-miss',
        location: 'teAkaMaoridictionaryScrape.ts:scrapeTeAkaMaoridictionaryLemma',
        message: 'No entries but HTML is not Te Aka slug miss — no search fallback',
        data: { lemma: lc },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return result
  }

  const searchHtml = await fetchMaoridictionarySearchPage(lc)
  if (!searchHtml) {
    // #region agent log
    void fetch('http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'e1a103',
      },
      body: JSON.stringify({
        sessionId: 'e1a103',
        hypothesisId: 'H-search-fetch-fail',
        location: 'teAkaMaoridictionaryScrape.ts:scrapeTeAkaMaoridictionaryLemma',
        message: 'Te Aka search page fetch failed',
        data: { lemma: lc },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return result
  }

  const resolvedUrl = extractFirstCanonicalWordUrlFromSearchHtml(searchHtml)
  if (!resolvedUrl) {
    // #region agent log
    void fetch('http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'e1a103',
      },
      body: JSON.stringify({
        sessionId: 'e1a103',
        hypothesisId: 'H-search-no-permalink',
        location: 'teAkaMaoridictionaryScrape.ts:scrapeTeAkaMaoridictionaryLemma',
        message: 'Search HTML had no Link to this word target',
        data: { lemma: lc },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return result
  }

  const followHtml = await fetchMaoridictionaryUrl(resolvedUrl)
  if (!followHtml) return result

  result = parseMaoridictionaryWordPageHtml(followHtml, rawLemma)
  if (result?.entries?.length) {
    const canonical = result.word.trim().normalize('NFC').toLowerCase()
    result = {
      ...result,
      sourceUrl: `${SITE_ORIGIN}/word/${encodeURIComponent(canonical)}`,
      scraperBuild: 'panui-maoridictionary-scrape-v2-search-fallback',
    }
    // #region agent log
    void fetch('http://127.0.0.1:7812/ingest/b0a492bc-27c1-4e3b-8c3d-6d620b84c1db', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'e1a103',
      },
      body: JSON.stringify({
        sessionId: 'e1a103',
        hypothesisId: 'H-search-fallback-ok',
        location: 'teAkaMaoridictionaryScrape.ts:scrapeTeAkaMaoridictionaryLemma',
        message: 'Te Aka entries loaded after search fallback',
        data: {
          lemma: lc,
          resolvedUrl,
          canonicalHeadword: canonical,
          entryCount: result.entries.length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }

  return result
}
