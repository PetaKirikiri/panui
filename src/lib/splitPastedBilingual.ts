import { classifyBlockLang, scoreBlockLang } from './bilingualPaste'

export type LangSpan = { text: string; lang: 'en' | 'mi' }

export type SplitPastedMethod = 'paragraph-classify'

export type SplitPastedResult = {
  mi: string
  en: string
  warnings: string[]
  method: SplitPastedMethod
}

function splitIntoParagraphBlocks(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)

  if (paragraphs.length >= 2) return paragraphs

  /** Single “paragraph” but multiple lines (common paste with `\n` only between Mi/En lines). */
  const single = paragraphs[0] ?? normalized.trim()
  const lines = single
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length >= 2) return lines

  return paragraphs.length ? paragraphs : lines
}

/** Join manual line wraps when the previous line is clearly mid-sentence (paste breaks only). */
function mergeSoftWrappedLines(lines: string[]): string[] {
  if (lines.length <= 1) return lines

  const out: string[] = []
  let acc = lines[0]
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const prev = acc.trimEnd()
    const prevEndsSentence = /[.!?]["'")\]]?\s*$/.test(prev)
    const next = line.trimStart()
    const looksLikeContinuation =
      /^[a-z(\u2014\u2013-]/.test(next) || /^['\u2018\u2019\u201c\u201d]/.test(next)

    let merge = false
    if (!prevEndsSentence && looksLikeContinuation) {
      const langAcc = classifyBlockLang(acc)
      const langLine = classifyBlockLang(line)
      merge = langAcc === 'en' && langLine === 'en'
    }

    if (merge) {
      acc = `${acc} ${line}`
    } else {
      out.push(acc)
      acc = line
    }
  }
  out.push(acc)
  return out
}

/** Abbreviations whose "." must not start a sentence split when splitting long chunks. */
const ABBREV_DOT_RE =
  /\b(?:Mrs|Ms|Miss|Mr|Dr|Prof|Sr|Jr|St|etc|vs|e\.g|i\.e)\.(?=\s)/gi

function splitLongChunkAtSentences(chunk: string): string[] {
  const placeholders: string[] = []
  let masked = chunk.replace(ABBREV_DOT_RE, (match) => {
    const id = placeholders.length
    placeholders.push(match)
    return `\uE000${id}\uE001`
  })

  masked = masked.replace(/\b(\d+)\.(?=\s)/g, (_, n: string) => {
    const id = placeholders.length
    placeholders.push(`${n}.`)
    return `\uE000${id}\uE001`
  })

  const parts = masked
    .split(
      /(?<=[.!?])\s+(?=(?:[\u2018'"(\[][A-Za-zĀĒĪŌŪāēīōū]|[A-ZĀĒĪŌŪ]))/,
    )
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  return parts.map((part) => {
    let restored = part
    for (let i = 0; i < placeholders.length; i++) {
      restored = restored.replaceAll(`\uE000${i}\uE001`, placeholders[i])
    }
    return restored
  })
}

/**
 * Split one coarse block into smaller spans so classification uses linguistic ranges,
 * not only whole paragraphs (dialogue lines, long-line sentence runs).
 */
export function segmentIntoLangUnits(block: string): string[] {
  const t = block.trim()
  if (!t) return []

  const lines = t.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  const merged = mergeSoftWrappedLines(lines)
  const primary = merged.length >= 2 ? merged : [t]

  const maxChunk = 280
  const out: string[] = []
  for (const chunk of primary) {
    if (chunk.length <= maxChunk) {
      out.push(chunk)
      continue
    }
    const sentences = splitLongChunkAtSentences(chunk)
    out.push(...(sentences.length >= 2 ? sentences : [chunk]))
  }
  return out
}

/**
 * Māori column: send English-looking spans to the English side unless there is strong te reo signal
 * (macrons, or primary classifier says mi with higher mi than en score).
 */
export function classifyLangForMiSlot(unit: string): 'mi' | 'en' {
  const t = unit.trim()
  if (!t) return 'en'
  if (/[āēīōūĀĒĪŌŪ]/.test(unit)) return classifyBlockLang(unit)
  const { mi, en } = scoreBlockLang(t)
  if (mi > en && classifyBlockLang(unit) === 'mi') return 'mi'
  /** Tie or English wins → keep English prose out of the Māori gutter. */
  if (en >= mi) return 'en'
  return classifyBlockLang(unit)
}

/** English column: send te reo spans to Māori unless clearly English prose. */
export function classifyLangForEnSlot(unit: string): 'mi' | 'en' {
  const t = unit.trim()
  if (!t) return 'en'
  if (/[āēīōūĀĒĪŌŪ]/.test(unit)) return 'mi'
  const { mi, en } = scoreBlockLang(t)
  if (mi > en) return 'mi'
  if (en > mi) return 'en'
  return classifyBlockLang(unit)
}

/** Same segmentation as {@link enumerateLangSpans}, slot-biased labelling per column semantics. */
export function enumerateLangSpansInSlot(raw: string, slot: 'mi' | 'en'): LangSpan[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  const pick = slot === 'mi' ? classifyLangForMiSlot : classifyLangForEnSlot
  const blocks = splitIntoParagraphBlocks(trimmed)
  const out: LangSpan[] = []
  for (const block of blocks) {
    for (const unit of segmentIntoLangUnits(block)) {
      out.push({ text: unit, lang: pick(unit) })
    }
  }
  return out
}

/**
 * One aligned row (Māori cell │ English cell): classify each span against its gutter, then merge
 * so English never stays in {@code miCell} unless it still registers as Māori under {@link classifyLangForMiSlot}.
 */
export function partitionAlignedRowBySlotBias(miCell: string, enCell: string): { mi: string; en: string } {
  const outMi: string[] = []
  const outEn: string[] = []

  for (const { text, lang } of enumerateLangSpansInSlot(miCell, 'mi')) {
    const t = text.trim()
    if (!t) continue
    if (lang === 'mi') outMi.push(t)
    else outEn.push(t)
  }
  for (const { text, lang } of enumerateLangSpansInSlot(enCell, 'en')) {
    const t = text.trim()
    if (!t) continue
    if (lang === 'en') outEn.push(t)
    else outMi.push(t)
  }

  return {
    mi: outMi.join('\n\n'),
    en: outEn.join('\n\n'),
  }
}

export function enumerateLangSpans(raw: string): LangSpan[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  const blocks = splitIntoParagraphBlocks(trimmed)
  const out: LangSpan[] = []
  for (const block of blocks) {
    for (const unit of segmentIntoLangUnits(block)) {
      out.push({ text: unit, lang: classifyBlockLang(unit) })
    }
  }
  return out
}

/** Live preview in reader — identical logic to blur split (classify each span; ignore paragraph pairing). */
export function enumerateLangSpansLive(raw: string): LangSpan[] {
  return enumerateLangSpans(raw)
}

/**
 * Bucket Māori vs English columns only from {@link classifyBlockLang} on each span.
 * Does **not** assume alternating paragraphs or “next block is the other language”.
 */
export function splitPastedBilingual(raw: string, _chapterNumber: number): SplitPastedResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { mi: '', en: '', warnings: [], method: 'paragraph-classify' }
  }

  const blocks = splitIntoParagraphBlocks(trimmed)
  if (blocks.length === 0) {
    return {
      mi: '',
      en: '',
      warnings: ['No paragraphs found after splitting.'],
      method: 'paragraph-classify',
    }
  }

  const miBlocks: string[] = []
  const enBlocks: string[] = []
  for (const block of blocks) {
    for (const unit of segmentIntoLangUnits(block)) {
      if (classifyBlockLang(unit) === 'mi') {
        miBlocks.push(unit)
      } else {
        enBlocks.push(unit)
      }
    }
  }

  return {
    mi: miBlocks.join('\n\n'),
    en: enBlocks.join('\n\n'),
    warnings: [],
    method: 'paragraph-classify',
  }
}
