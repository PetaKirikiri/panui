import { describe, expect, it } from 'vitest'
import { miChunkSegments } from './miChunkSpans'

describe('miChunkSegments', () => {
  it('splits words and preserves punctuation/spaces', () => {
    const s = miChunkSegments('Kei te haere.')
    expect(s).toEqual([
      { kind: 'word', raw: 'Kei', lemma: 'kei' },
      { kind: 'text', value: ' ' },
      { kind: 'word', raw: 'te', lemma: 'te' },
      { kind: 'text', value: ' ' },
      { kind: 'word', raw: 'haere', lemma: 'haere' },
      { kind: 'text', value: '.' },
    ])
  })
})
