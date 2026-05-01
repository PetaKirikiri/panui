import { describe, expect, it } from 'vitest'
import {
  normalizeTeAkaResultForDisplay,
  partitionFusedLemmaBlocks,
  parseParenNumberedWall,
} from './teAkaWordRegistry'

describe('Te Aka fused homograph walls', () => {
  it('splits two korokē headline blocks on separate lines', () => {
    const raw = ['korokē', '', '1. (modifier) a.', '', 'korokē', '', '1. (adjective) ironic.'].join('\n')
    const parts = partitionFusedLemmaBlocks(raw, 'korokē')
    expect(parts.length).toBe(2)
    const row2 = parseParenNumberedWall(parts[1] ?? '')
    expect(row2.some((e) => e.pos === 'adjective' && /ironic/i.test(e.definition))).toBe(true)
  })

  it('splits fused one-line scrape before restarted numbering', () => {
    const oneLine =
      '1. (modifier) extraordinary. — 2. (noun) bloke korokē 1. (adjective) ironic. Synonyms: x'
    const parts = partitionFusedLemmaBlocks(oneLine, 'korokē')
    expect(parts.length).toBe(2)
    expect(parseParenNumberedWall(parts[1]!).some((e) => e.pos === 'adjective')).toBe(true)
  })

  it('normalizes megafused single entry rows into separate senses', () => {
    const fused =
      '1. (modifier) strange. — 2. (noun) fellow korokē 1. (adjective) ironic. Synonyms: parori.'
    const r = normalizeTeAkaResultForDisplay({
      word: 'korokē',
      sourceUrl: 'https://maoridictionary.co.nz/word/3036',
      entries: [{ pos: 'wall', definition: fused }],
    })
    expect(r.entries.length).toBeGreaterThanOrEqual(3)
    expect(r.entries.some((e) => e.pos === 'adjective')).toBe(true)
  })
})
