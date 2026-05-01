/**
 * Pattern matching at render time. Finds contiguous token runs that match
 * pos_chunk_patterns sequences. Used to render connected underlines.
 */

import { getTokensForSegment, getTokensForSentence, splitIntoSentences, isPunctuationOnlyToken } from './tokens'
import { splitWordAndPunctuation } from './tokenStyling'
import type { SentenceToken, ChunkPatternPresentation, ChunkPatternSurfaceRule } from '../db/schema'

export type PosPattern = { sequence: number[] }

export type ChunkPatternInput = PosPattern & {
  id?: number
  name?: string
  presentation?: ChunkPatternPresentation | null
}

export type PatternRun = { start: number; end: number }

export type DraggableChunk = {
  sentenceId: number
  start: number
  end: number
  tokens: SentenceToken[]
  patternName: string
}

export type SentenceLike = { id: number; tokens_array?: unknown; sentence_text?: string }

export function normalizeWordSurface(text: string, mode: ChunkPatternSurfaceRule['normalize'] = 'lower'): string {
  const { word } = splitWordAndPunctuation(text)
  let s = word.trim()
  if (mode === 'lower' || mode === 'nfc_lower') s = s.toLowerCase()
  if (mode === 'nfc' || mode === 'nfc_lower') s = s.normalize('NFC')
  return s
}

/** When `rules` is empty/undefined, POS match alone wins. Non-arrays (e.g. `{}`) are ignored. */
export function sliceMatchesSurface(
  slice: SentenceToken[],
  rules: ChunkPatternSurfaceRule[] | undefined | null
): boolean {
  if (rules == null || !Array.isArray(rules) || rules.length === 0) return true
  for (const r of rules) {
    const t = slice[r.slot]
    if (!t) return false
    const mode = r.normalize ?? 'lower'
    const surf = normalizeWordSurface(t.text ?? '', mode)
    const allowed = r.in.map((x) => normalizeWordSurface(x, mode))
    if (!allowed.includes(surf)) return false
  }
  return true
}

function posSliceMatchesSequence(slice: SentenceToken[], sequence: number[]): boolean {
  if (slice.length !== sequence.length) return false
  if (slice.some(isPunctuationOnlyToken)) return false
  if (!slice.every((t) => t.pos_type_id != null)) return false
  return slice.every((t, j) => t.pos_type_id === sequence[j])
}

/**
 * Finds all pattern chunks for drag-to-image. Processes each logical segment
 * separately (splits on full stop). Deduplicates by span so the same chunk is
 * not shown twice when multiple patterns match.
 */
export function findDraggableChunks(
  sentences: SentenceLike[],
  patterns: ChunkPatternInput[]
): DraggableChunk[] {
  const allowed = patterns.filter(
    (p) => Array.isArray(p.sequence) && p.sequence.length >= 2
  )
  if (allowed.length === 0) return []

  const seen = new Set<string>()
  const chunks: DraggableChunk[] = []

  for (const sent of sentences) {
    const segments = splitIntoSentences((sent.sentence_text ?? '').trim())
    const segmentCount = segments.length > 0 ? segments.length : 1

    for (let segIdx = 0; segIdx < segmentCount; segIdx++) {
      const tokens =
        segments.length > 0 ? getTokensForSegment(sent, segIdx) : getTokensForSentence(sent)
      if (tokens.length === 0) continue

      for (let i = 0; i < tokens.length; i++) {
        for (const { name, sequence, presentation } of allowed) {
          const seq = sequence!
          if (i + seq.length > tokens.length) continue
          const slice = tokens.slice(i, i + seq.length)
          const hasPunct = slice.some(isPunctuationOnlyToken)
          if (hasPunct) continue
          const allHavePos = slice.every((t) => t.pos_type_id != null)
          if (!allHavePos) continue
          const tokenIds = slice.map((t) => t.pos_type_id!)
          if (!tokenIds.every((id, j) => id === seq[j])) continue
          if (!sliceMatchesSurface(slice, presentation?.surface)) continue

          const key = `${sent.id}:${segIdx}:${i}:${i + seq.length}`
          if (seen.has(key)) continue
          seen.add(key)

          chunks.push({
            sentenceId: sent.id,
            start: i,
            end: i + seq.length,
            tokens: [...slice],
            patternName: name ?? '',
          })
        }
      }
    }
  }
  return chunks
}

/**
 * Returns non-overlapping pattern runs. Greedy longest-match: at each position,
 * try the longest pattern first; if it matches, consume those tokens and continue.
 */
export function findPatternRuns(
  tokens: SentenceToken[],
  patterns: PosPattern[]
): PatternRun[] {
  const runs: PatternRun[] = []
  const sequences = patterns
    .filter((p) => Array.isArray(p.sequence) && p.sequence.length >= 2)
    .map((p) => p.sequence)
    .sort((a, b) => b.length - a.length)

  let i = 0
  while (i < tokens.length) {
    let matched: { len: number } | null = null
    for (const seq of sequences) {
      if (i + seq.length > tokens.length) continue
      const slice = tokens.slice(i, i + seq.length)
      if (slice.some(isPunctuationOnlyToken)) continue
      const allHavePos = slice.every((t) => t.pos_type_id != null)
      if (!allHavePos) continue
      const tokenIds = slice.map((t) => t.pos_type_id!)
      if (tokenIds.every((id, j) => id === seq[j])) {
        matched = { len: seq.length }
        break
      }
    }
    if (matched) {
      runs.push({ start: i, end: i + matched.len })
      i += matched.len
    } else {
      i += 1
    }
  }
  return runs
}

export type PatternRunWithName = {
  start: number
  end: number
  patternId: number
  patternName: string
  presentation?: ChunkPatternPresentation | null
}

export type PatternWithId = {
  id: number
  name: string
  sequence: number[]
  shapeConfig?: unknown
  presentation?: ChunkPatternPresentation | null
}

/**
 * Returns non-overlapping pattern runs with pattern id and name.
 * Greedy longest-match: at each position, try the longest pattern first.
 */
export function findPatternRunsWithNames(
  tokens: SentenceToken[],
  patterns: PatternWithId[]
): PatternRunWithName[] {
  const runs: PatternRunWithName[] = []
  const sorted = [...patterns]
    .filter((p) => Array.isArray(p.sequence) && p.sequence.length >= 2)
    .sort((a, b) => b.sequence.length - a.sequence.length)

  let i = 0
  while (i < tokens.length) {
    let matched: {
      len: number
      patternId: number
      patternName: string
      presentation: ChunkPatternPresentation | null
    } | null = null
    for (const p of sorted) {
      const seq = p.sequence
      if (i + seq.length > tokens.length) continue
      const slice = tokens.slice(i, i + seq.length)
      if (slice.some(isPunctuationOnlyToken)) continue
      const allHavePos = slice.every((t) => t.pos_type_id != null)
      if (!allHavePos) continue
      const tokenIds = slice.map((t) => t.pos_type_id!)
      if (!tokenIds.every((id, j) => id === seq[j])) continue
      if (!sliceMatchesSurface(slice, p.presentation?.surface)) continue
      matched = {
        len: seq.length,
        patternId: p.id,
        patternName: p.name ?? '',
        presentation: p.presentation ?? null,
      }
      break
    }
    if (matched) {
      runs.push({
        start: i,
        end: i + matched.len,
        patternId: matched.patternId,
        patternName: matched.patternName,
        presentation: matched.presentation,
      })
      i += matched.len
    } else {
      i += 1
    }
  }
  return runs
}

/**
 * Chunk spans follow the same greedy POS-only logic as `findPatternRuns` so phrase grouping stays stable.
 * Then attaches pattern id / presentation: prefers a row that also passes optional `presentation.surface`
 * rules; otherwise falls back to any POS-matching row so display metadata never drops a valid phrase span.
 */
export function findPatternRunsForDisplay(
  tokens: SentenceToken[],
  chunkPatterns: ChunkPatternInput[]
): PatternRunWithName[] {
  const baseRuns = findPatternRuns(tokens, chunkPatterns)
  const sorted = [...chunkPatterns]
    .filter((p) => Array.isArray(p.sequence) && p.sequence.length >= 2)
    .sort((a, b) => b.sequence.length - a.sequence.length)

  const enriched = baseRuns.map((run, runIdx) => {
    const slice = tokens.slice(run.start, run.end)
    const len = run.end - run.start
    const fallbackId = -(runIdx + 1)

    let picked: ChunkPatternInput | null = null
    for (const p of sorted) {
      if (p.sequence.length !== len) continue
      if (!posSliceMatchesSequence(slice, p.sequence)) continue
      if (!sliceMatchesSurface(slice, p.presentation?.surface)) continue
      picked = p
      break
    }
    if (!picked) {
      for (const p of sorted) {
        if (p.sequence.length !== len) continue
        if (!posSliceMatchesSequence(slice, p.sequence)) continue
        picked = p
        break
      }
    }

    if (!picked) {
      return {
        start: run.start,
        end: run.end,
        patternId: fallbackId,
        patternName: '',
        presentation: null,
      }
    }

    return {
      start: run.start,
      end: run.end,
      patternId: typeof picked.id === 'number' ? picked.id : fallbackId,
      patternName: picked.name ?? '',
      presentation: picked.presentation ?? null,
    }
  })

  return enriched
}
