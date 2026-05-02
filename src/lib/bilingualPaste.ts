import type { ReadingBatch } from '../content/schema'

/** Māori macrons + common tohutō used for heuristic classification */
const MACRON_RE = /[āēīōūĀĒĪŌŪ]/u

/** Letters incl. macrons for token counting */
const TOKEN_RE = /[a-zA-ZāēīōūĀĒĪŌŪ]+/gu

/** Normalise token for lexicon lookup (macrons → ASCII vowels) */
function normalizeTokenForLexicon(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ā/g, 'a')
    .replace(/ē/g, 'e')
    .replace(/ī/g, 'i')
    .replace(/ō/g, 'o')
    .replace(/ū/g, 'u')
}

/**
 * Frequent te reo grammatical items / lexemes (ASCII-normalised keys).
 * Avoid bare “i”, “a”, “o” — too ambiguous with English.
 */
const MI_LEXICON = new Set<string>(
  [
    'ae', 'ahau', 'ahakoa', 'ai', 'ana', 'ano', 'anu', 'atu', 'ei', 'ena', 'enei', 'era', 'ia',
    'iho', 'inoa', 'iti', 'iwi', 'katoa', 'kau', 'kawe', 'ke', 'kei', 'kia', 'kihai', 'ko',
    'koe', 'konei', 'kona', 'kore', 'koutou', 'kua', 'mai', 'matou', 'mea', 'mei',
    'mo', 'na', 'nei', 'no', 'noa', 'nga', 'ngaru', 'niho', 'oru', 'pai', 'pea', 'pono',
    'pu', 'ra', 'rangatira', 'raho', 'rawa', 'roto', 'runga', 'raro', 'tau', 'taua', 'tatou',
    'tenei', 'tera', 'teia', 'te', 'timata', 'titiro', 'tokorua', 'tonu', 'tona', 'tou', 'tu',
    'whenua', 'whaka', 'whanau', 'whare', 'whakaaro', 'akonga', 'tamariki', 'tamaiti',
    'tangata', 'tika', 'tuatahi', 'tuarua', 'tuatoru', 'tauira', 'tuhi', 'tuhinga', 'ahua',
    'haere', 'hoki', 'hongi', 'hiahia', 'hinga', 'hua', 'ika', 'kai', 'karakia', 'korero',
    'manu', 'marama', 'mauri', 'motu', 'muri', 'mutu', 'nikau', 'nono', 'onga', 'ora', 'oti',
    'patu', 'po', 'pora', 'pure', 'raki', 'taki', 'taiao', 'tao', 'tauhou', 'tauiwi',
    'tohunga', 'waka', 'whanui', 'whakarongo', 'whiri', 'kaore', 'kao', 'mehemea', 'ona',
    'orite', 'tetahi', 'etahi', 'pehea', 'wai', 'he', 'ki', 'hei', 'panui', 'ngeru', 'ouri',
    'tikanga', 'noho', 'rongonui', 'mohiotanga', 'korua',
  ].map(normalizeTokenForLexicon),
)

/** English WH- words — don’t treat as Māori “wh” orthography */
const WH_ASCII_ENGLISH = new Set<string>(
  ['what', 'when', 'where', 'which', 'while', 'white', 'who', 'whom', 'whose', 'why', 'whether', 'whilst'].map(
    normalizeTokenForLexicon,
  ),
)

/** High-frequency English prose tokens (ASCII). */
const EN_LEXICON = new Set<string>(
  [
    'a', 'about', 'after', 'again', 'all', 'also', 'an', 'and', 'another', 'any', 'are',
    'around', 'as', 'at', 'away', 'back', 'be', 'because', 'been', 'before', 'being',
    'below', 'between', 'both', 'but', 'by', 'came', 'can', 'cannot', 'could', 'did',
    'do', 'does', 'doing', 'done', 'down', 'each', 'even', 'ever', 'every', 'few',
    'first', 'for', 'from', 'get', 'getting', 'give', 'go', 'going', 'gone', 'good',
    'got', 'great', 'had', 'half', 'hand', 'hands', 'has', 'have', 'having',
    'head', 'held', 'help', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
    'how', 'however', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'keep',
    'kept', 'kind', 'know', 'large', 'last', 'later', 'least', 'leave', 'left', 'like',
    'little', 'long', 'look', 'looking', 'made', 'make', 'making', 'man', 'many', 'may',
    'mean', 'might', 'mind', 'more', 'most', 'much', 'must', 'my', 'myself',
    'near', 'never', 'new', 'next', 'no', 'not', 'nothing', 'now', 'of', 'off', 'often',
    'old', 'on', 'once', 'one', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out',
    'over', 'own', 'part', 'people', 'perhaps', 'person', 'place', 'put', 'quite',
    'rather', 'really', 'right', 'said', 'same', 'saw', 'say', 'saying', 'see', 'seem',
    'seen', 'several', 'shall', 'she', 'should', 'show', 'side', 'since', 'small', 'so',
    'some', 'something', 'sometimes', 'somewhere', 'soon', 'still', 'such', 'sure',
    'take', 'taken', 'than', 'that', 'the', 'their', 'them', 'themselves', 'then',
    'there', 'these', 'they', 'thing', 'things', 'think', 'thinking', 'third', 'this',
    'those', 'though', 'thought', 'three', 'through', 'thus', 'time', 'times', 'to',
    'today', 'together', 'too', 'took', 'toward', 'true', 'try', 'two', 'under', 'until',
    'up', 'upon', 'us', 'used', 'using', 'very', 'want', 'was', 'way', 'ways', 'we',
    'well', 'went', 'were', 'what', 'whatever', 'when', 'whenever', 'where', 'whether',
    'which', 'while', 'who', 'whole', 'whose', 'why', 'will', 'with', 'within',
    'without', 'would', 'yes', 'yet', 'you', 'young', 'your', 'yours', 'yourself',
    'he',
  ],
)

/** Distinctive multi-word / boundary patterns more common in te reo than English prose */
const MI_PHRASE_RES: RegExp[] = [
  /\bko\s+te\b/giu,
  /\bte\s+tāngata\b/giu,
  /\bte\s+tangata\b/giu,
  /\bte\s+tamariki\b/giu,
  /\bte\s+tama\b/giu,
  /\bte\s+whare\b/giu,
  /\bte\s+kupu\b/giu,
  /\bte\s+reo\b/giu,
  /\bte\s+ingoa\b/giu,
  /\bi\s+te\b/giu,
  /\bki\s+te\b/giu,
  /\bkei\s+te\b/giu,
  /\bme\s+te\b/giu,
  /\bno\s+te\b/giu,
  /\bmō\s+te\b/giu,
  /\bmo\s+te\b/giu,
  /\bhei\s+te\b/giu,
  /\bkāore\b/giu,
  /\bkua\s+/giu,
  /\bka\s+taea\b/giu,
  /\bkā\s+/giu,
  /\bmehemea\b/giu,
  /\bahakoa\b/giu,
  /\btēnei\b/giu,
  /\btērā\b/giu,
  /\btētahi\b/giu,
  /\bē\s+rā\b/giu,
]

export type LangScores = { mi: number; en: number }

/**
 * Regex / lexicon scores for te reo vs English (no assumption about paragraph order).
 * Used by {@link classifyBlockLang}; exported for tests and debugging.
 */
export function scoreBlockLang(text: string): LangScores {
  let mi = 0
  let en = 0

  const trimmed = text.trim()
  if (!trimmed) return { mi: 0, en: 0 }

  const macrons = (trimmed.match(MACRON_RE) ?? []).length
  mi += macrons * 6

  let tokenMatch: RegExpExecArray | null
  const tokenRe = new RegExp(TOKEN_RE.source, TOKEN_RE.flags)
  tokenRe.lastIndex = 0
  while ((tokenMatch = tokenRe.exec(trimmed)) !== null) {
    const tok = normalizeTokenForLexicon(tokenMatch[0])
    if (tok.length < 2) continue
    if (MI_LEXICON.has(tok)) mi += 4
    if (EN_LEXICON.has(tok)) en += 3
    if (tok.length >= 4 && tok.startsWith('wh') && !WH_ASCII_ENGLISH.has(tok)) mi += 5
  }

  let miPhraseHitsTotal = 0
  for (const re of MI_PHRASE_RES) {
    const m = trimmed.match(re)
    if (m) {
      miPhraseHitsTotal += m.length
      mi += m.length * 5
    }
  }

  /** Verb clauses — unmistakable te reo word order even without macrons. */
  const kuaKaVerbClauses = (trimmed.match(/\b(?:kua|ka)\s+[a-zāēīōū]{3,}/giu) ?? []).length
  mi += Math.min(42, kuaKaVerbClauses * 11)

  const teNgāHits = (trimmed.match(/\b(?:te|ngā)\s+/giu) ?? []).length

  /** Down-weight English fiction heuristics when te reo shells are already firing. */
  const suppressEnFiction =
    macrons >= 1 ||
    miPhraseHitsTotal >= 3 ||
    kuaKaVerbClauses >= 1 ||
    teNgāHits >= 4

  const fs = suppressEnFiction ? 0.38 : 1

  /** English narrative prose (novel dialogue): damped when suppressEnFiction */
  const theHits = (trimmed.match(/\bthe\b/gi) ?? []).length
  if (theHits >= 4) en += Math.round(Math.min(32, theHits * 3) * fs)
  else if (theHits >= 2) en += Math.round(theHits * 2 * fs)

  const andHits = (trimmed.match(/\band\b/gi) ?? []).length
  if (andHits >= 3) en += Math.round(Math.min(18, andHits * 2) * fs)

  const wasWereHits =
    (trimmed.match(/\b(was|were|had|said)\b/gi) ?? []).length
  if (wasWereHits >= 2) en += Math.round(wasWereHits * 2 * fs)

  const tokenCount = (trimmed.match(TOKEN_RE) ?? []).length
  const enStrength = en
  if (
    tokenCount > 0 &&
    tokenCount < 6 &&
    macrons === 0 &&
    mi <= en &&
    enStrength < 12 &&
    !suppressEnFiction
  ) {
    const vowelHeavy = (trimmed.match(/[aeiouāēīōū]/giu) ?? []).length / trimmed.length
    if (vowelHeavy > 0.42) mi += 2
  }

  const saidHits = (trimmed.match(/\b(said|replies|replied|muttering|muttered|whispered|answered|asked|called|cried|shouted)\b/gi) ?? []).length
  if (saidHits >= 1) en += Math.round(Math.min(28, saidHits * 7) * fs)

  const contractionHits = (
    trimmed.match(
      /\b(I'd|I've|We're|we've|We've|that's|That's|it's|It's|don't|Don't|can't|Can't|isn't|wasn't|couldn't|wouldn't|hadn't|best|G'night)\b/g,
    ) ?? []
  ).length
  if (contractionHits >= 1) en += Math.round(Math.min(16, contractionHits * 4) * fs)

  if (/\bProfessor\b/i.test(trimmed)) en += Math.round(10 * fs)
  if (/\b(sir|madam)\b[.!?\s]*$/i.test(trimmed.trim())) en += Math.round(4 * fs)

  return { mi, en }
}

/**
 * Parallel editions sometimes embed te reo dialogue inside English paragraphs (quoted lines).
 * Those spans still classify the whole block as English. Pull clearly te reo quoted spans out of
 * {@link english} and return them so callers can merge into the Māori column.
 */
export function extractQuotedTeReoFromEnglish(english: string): {
  english: string
  extractedMi: string[]
} {
  const extractedMi: string[] = []
  let working = english

  /** Curly single quotes — avoids breaking on ASCII apostrophes inside dialogue. */
  const curlyPairs = [...working.matchAll(/\u2018([^\u2019]{10,})\u2019/g)]
  for (const m of curlyPairs) {
    const inner = (m[1] ?? '').trim()
    const full = m[0] ?? ''
    const scores = scoreBlockLang(inner)
    const looksMi =
      scores.mi > scores.en ||
      (MACRON_RE.test(inner) && scores.mi >= scores.en - 4)
    if (!looksMi || classifyBlockLang(inner) !== 'mi') continue
    extractedMi.push(inner)
    working = working.split(full).join(' ')
  }

  working = working.replace(/\u2018/g, "'").replace(/\u2019/g, "'")

  /** Straight quotes: avoid treating apostrophes in English contractions (don't) as dialogue openers. */
  for (const m of [...working.matchAll(/(?<![a-zA-Z])'([^']{10,})'/g)]) {
    const inner = (m[1] ?? '').trim()
    const full = m[0] ?? ''
    const scores = scoreBlockLang(inner)
    const looksMi =
      scores.mi > scores.en ||
      (MACRON_RE.test(inner) && scores.mi >= scores.en - 4)
    if (!looksMi || classifyBlockLang(inner) !== 'mi') continue
    extractedMi.push(inner)
    working = working.split(full).join(' ')
  }

  const cleaned = working
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim()

  return { english: cleaned, extractedMi }
}

function isPurePlaceholderBlock(text: string): boolean {
  const t = text.trim()
  return /^fill\s+in\b/im.test(t) && t.length < 200
}

/**
 * Strip “Additional info:” / “Subsequent action:” so body text pairs normally.
 * Returns `text: null` to skip (divider-only, empty editorial, short fill-in).
 */
export function unwrapEditorialBlock(block: string): { text: string | null; warning?: string } {
  const trimmed = block.trim()
  if (!trimmed) return { text: null }

  if (/^[\s\-_=]+$/.test(trimmed)) {
    return { text: null, warning: 'Skipped divider line.' }
  }

  if (isPurePlaceholderBlock(trimmed)) {
    return { text: null, warning: 'Skipped placeholder block.' }
  }

  const lines = trimmed.split('\n').map((l) => l.trimEnd())
  const first = lines[0]?.trim() ?? ''

  const editorial = /^(additional\s+info|subsequent\s+action)\s*:\s*(.*)$/i.exec(first)
  if (editorial) {
    const label = editorial[1] ?? ''
    const tailFirst = (editorial[2] ?? '').trim()
    const body = [tailFirst, ...lines.slice(1)]
      .map((x) => x.trim())
      .filter((x) => x.length > 0)
      .join('\n')
      .trim()

    if (!body) {
      return { text: null, warning: `Skipped empty editorial (${label}).` }
    }

    return {
      text: body,
      warning: `Imported body after “${label}:” only (prefix removed).`,
    }
  }

  return { text: trimmed }
}

const PAGE_ONLY_RE = /^Page\s+(\d+)\s*$/i

/**
 * Leading page label merged into a paragraph, e.g. `Page 1 Whakaī ana…` or `Page 16\nKo te…`.
 * Returns remainder without the prefix; `pageNumber` when a valid marker was stripped.
 */
export function stripLeadingPageFromText(text: string): {
  text: string
  pageNumber: number | null
} {
  const trimmed = text.trim()
  const m = trimmed.match(/^Page\s+(\d+)\b\s*/i)
  if (!m) return { text: trimmed, pageNumber: null }
  const n = Number.parseInt(m[1] ?? '', 10)
  const pageNumber = Number.isFinite(n) && n >= 1 ? n : null
  const rest = trimmed.slice(m[0].length).trim()
  return { text: rest, pageNumber }
}

export type ClassifiedBlock = {
  text: string
  pageNumber: number
  lang: 'en' | 'mi'
}

export type PasteSegment = {
  pageNumber: number
  paragraphNumber: number
  english: string
  maori: string
}

export type ParseBilingualPasteResult = {
  warnings: string[]
  segments: PasteSegment[]
  /** Preview batches matching `fetchStoryReaderPayload` grouping */
  batches: ReadingBatch[]
}

function normalizeNewlines(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function splitParagraphBlocks(raw: string): string[] {
  const normalized = normalizeNewlines(raw)
  return normalized
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
}

/** When both paragraphs classify as the same language, infer EN vs MI from comparative scores */
const PAIR_LANG_DELTA_EPS = 5

export function reconcilePairLanguages(aText: string, bText: string): {
  english: string
  maori: string
} | null {
  const la = classifyBlockLang(aText)
  const lb = classifyBlockLang(bText)

  if (la !== lb) {
    return la === 'en'
      ? { english: aText, maori: bText }
      : { english: bText, maori: aText }
  }

  const sa = scoreBlockLang(aText)
  const sb = scoreBlockLang(bText)
  const da = sa.mi - sa.en
  const db = sb.mi - sb.en

  const theA = (aText.match(/\bthe\b/gi) ?? []).length
  const theB = (bText.match(/\bthe\b/gi) ?? []).length

  if (theA >= 4 && theB <= 1) return { english: aText, maori: bText }
  if (theB >= 4 && theA <= 1) return { english: bText, maori: aText }

  if (Math.abs(da - db) >= PAIR_LANG_DELTA_EPS) {
    return da > db
      ? { english: bText, maori: aText }
      : { english: aText, maori: bText }
  }

  const ma = MACRON_RE.test(aText)
  const mb = MACRON_RE.test(bText)
  if (ma && !mb) return { english: bText, maori: aText }
  if (!ma && mb) return { english: aText, maori: bText }

  if (theA !== theB) {
    return theA > theB
      ? { english: aText, maori: bText }
      : { english: bText, maori: aText }
  }

  return null
}

/** Classify paragraph block: junk skipped upstream. Uses scored lexicons + regexes, not block order. */
export function classifyBlockLang(text: string): 'en' | 'mi' {
  const trimmed = text.trim()
  const { mi, en } = scoreBlockLang(text)
  if (mi > en) return 'mi'
  if (en > mi) return 'en'
  if (MACRON_RE.test(text)) return 'mi'
  if (
    /\b(?:kua|ka)\s+[a-zāēīōū]{3,}/iu.test(trimmed) ||
    /\bko\s+te\b/iu.test(trimmed) ||
    /\b(?:ki|kei|hei)\s+te\b/iu.test(trimmed)
  ) {
    return 'mi'
  }
  return 'en'
}

/**
 * When paired paragraphs landed in the wrong columns (English prose under `maori`, te reo under `english`),
 * swap them back. Same heuristic as {@link classifyBlockLang}.
 */
export function normalizePairedParagraphColumns(
  english: string,
  maori: string,
): { english: string; maori: string } {
  if (classifyBlockLang(english) === 'mi' && classifyBlockLang(maori) === 'en') {
    return { english: maori, maori: english }
  }
  return { english, maori }
}

/**
 * Parse pasted bilingual prose into paired segments and preview batches.
 * Expects alternating Māori / English blocks (order flexible per pair).
 * Standalone `Page N` lines update `currentPage`; if one falls **between** the two blocks of a pair,
 * the previous block’s page is bumped so Mi and En stay on the same page.
 * A leading `Page N` at the start of a paragraph (e.g. `Page 1 Whakaī ana…`) is stripped,
 * updates the page, and the remainder is classified as usual.
 */
export function parseBilingualPaste(raw: string, chapterNumber: number): ParseBilingualPasteResult {
  const warnings: string[] = []
  const blocks = splitParagraphBlocks(raw)

  let currentPage = 1
  const classified: ClassifiedBlock[] = []

  for (const block of blocks) {
    const pageMatch = block.match(PAGE_ONLY_RE)
    if (pageMatch) {
      currentPage = Number.parseInt(pageMatch[1] ?? '1', 10)
      if (!Number.isFinite(currentPage) || currentPage < 1) {
        warnings.push(`Ignored invalid page marker: "${block.slice(0, 40)}…"`)
        currentPage = 1
      } else if (classified.length % 2 === 1) {
        /** Standalone page line between Mi and En — attach page to both halves of this pair */
        classified[classified.length - 1].pageNumber = currentPage
      }
      continue
    }

    const unwrapped = unwrapEditorialBlock(block)
    if (unwrapped.text == null) {
      if (unwrapped.warning) warnings.push(unwrapped.warning)
      continue
    }
    if (unwrapped.warning) warnings.push(unwrapped.warning)

    let body = unwrapped.text
    const strippedPage = stripLeadingPageFromText(body)
    if (strippedPage.pageNumber != null) {
      currentPage = strippedPage.pageNumber
      body = strippedPage.text
    }
    if (!body) {
      continue
    }

    const lang = classifyBlockLang(body)
    let pageNumber = currentPage
    if (classified.length % 2 === 1) {
      const prev = classified[classified.length - 1]
      pageNumber = Math.max(prev.pageNumber, pageNumber)
      prev.pageNumber = pageNumber
    }
    classified.push({ text: body, pageNumber, lang })
  }

  /** Pair by consecutive blocks; requires one `en` and one `mi` per pair */
  const segments: PasteSegment[] = []
  const paraCounterByPage = new Map<number, number>()
  let quotedTeReoPulledFromEn = 0

  function nextParagraphNumber(pageNumber: number): number {
    const next = (paraCounterByPage.get(pageNumber) ?? 0) + 1
    paraCounterByPage.set(pageNumber, next)
    return next
  }

  for (let i = 0; i < classified.length; i += 2) {
    const a = classified[i]
    const b = classified[i + 1]
    if (!a || !b) {
      warnings.push(
        `Unpaired paragraph at end (expected pairs). Leftover block: ${a ? `"${a.text.slice(0, 48)}…"` : '(none)'}`,
      )
      break
    }

    const pageNumber = Math.max(a.pageNumber, b.pageNumber)

    const langs = new Set([a.lang, b.lang])
    let english: string
    let maori: string

    if (langs.has('en') && langs.has('mi')) {
      english = a.lang === 'en' ? a.text : b.text
      maori = a.lang === 'mi' ? a.text : b.text
    } else {
      const merged = reconcilePairLanguages(a.text, b.text)
      if (!merged) {
        warnings.push(
          `Pair at blocks ${i}-${i + 1} could not be split into EN+MI (similar scores). Skipping.`,
        )
        continue
      }
      english = merged.english
      maori = merged.maori
    }

    const quoted = extractQuotedTeReoFromEnglish(english)
    english = quoted.english
    if (quoted.extractedMi.length > 0) {
      quotedTeReoPulledFromEn++
      maori = [maori.trim(), ...quoted.extractedMi].filter(Boolean).join('\n\n')
    }

    {
      const aligned = normalizePairedParagraphColumns(english, maori)
      english = aligned.english
      maori = aligned.maori
    }

    segments.push({
      pageNumber,
      paragraphNumber: nextParagraphNumber(pageNumber),
      english,
      maori,
    })
  }

  if (quotedTeReoPulledFromEn > 0) {
    warnings.push(
      `Moved quoted te reo out of ${quotedTeReoPulledFromEn} English paragraph(s) into the Māori column for the matching segment.`,
    )
  }

  const batches = segmentsToReadingBatches(segments, chapterNumber)

  return { warnings, segments, batches }
}

function segmentsToReadingBatches(segments: PasteSegment[], chapterNumber: number): ReadingBatch[] {
  const byPage = new Map<number, PasteSegment[]>()
  for (const s of segments) {
    const list = byPage.get(s.pageNumber) ?? []
    list.push(s)
    byPage.set(s.pageNumber, list)
  }

  const sortedPages = [...byPage.keys()].sort((x, y) => x - y)

  return sortedPages.map((pageNumber, index) => {
    const segs = (byPage.get(pageNumber) ?? []).sort(
      (a, b) => a.paragraphNumber - b.paragraphNumber,
    )
    const english = segs.map((s) => s.english)
    const maori = segs.map((s) => s.maori)
    const label =
      chapterNumber > 0
        ? `Chapter ${chapterNumber} · Page ${pageNumber}`
        : pageNumber > 0
          ? `Page ${pageNumber}`
          : undefined

    return {
      id: `import-${chapterNumber}-${pageNumber}`,
      order: index + 1,
      label,
      english,
      maori,
    }
  })
}

/** Draft rows for `story_sentences` (one sentence per paragraph block). */
export type SentenceInsertDraft = {
  chapter_number: number
  page_number: number
  paragraph_number: number
  /** 0-based chunk within the page (reader row index). Defaults from paragraph_number - 1 when inserting. */
  chunk_index?: number
  sentence_number: number
  sentence_text: string
}

export function segmentsToSentenceDrafts(
  segments: PasteSegment[],
  chapterNumber: number,
): { en: SentenceInsertDraft[]; mi: SentenceInsertDraft[] } {
  const en: SentenceInsertDraft[] = []
  const mi: SentenceInsertDraft[] = []

  for (const s of segments) {
    en.push({
      chapter_number: chapterNumber,
      page_number: s.pageNumber,
      paragraph_number: s.paragraphNumber,
      chunk_index: Math.max(0, s.paragraphNumber - 1),
      sentence_number: 1,
      sentence_text: s.english,
    })
    mi.push({
      chapter_number: chapterNumber,
      page_number: s.pageNumber,
      paragraph_number: s.paragraphNumber,
      chunk_index: Math.max(0, s.paragraphNumber - 1),
      sentence_number: 1,
      sentence_text: s.maori,
    })
  }

  return { en, mi }
}

/** One DB row per paragraph for a fixed reader page (sentence_number 1). */
export function readerParagraphsToDrafts(
  paragraphs: string[],
  chapterNumber: number,
  pageNumber: number,
): SentenceInsertDraft[] {
  return paragraphs.map((sentence_text, i) => ({
    chapter_number: chapterNumber,
    page_number: pageNumber,
    paragraph_number: i + 1,
    chunk_index: i,
    sentence_number: 1,
    sentence_text,
  }))
}
