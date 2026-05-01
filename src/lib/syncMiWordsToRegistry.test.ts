import { describe, expect, it } from 'vitest'
import { uniqueMiWordTokensFromMiDrafts } from './syncMiWordsToRegistry'

describe('syncMiWordsToRegistry helpers', () => {
  it('extracts unique tokens from Māori drafts', () => {
    const drafts = [
      {
        chapter_number: 1,
        page_number: 1,
        paragraph_number: 1,
        sentence_number: 1,
        sentence_text: 'Kei te haere te kuri ki te whare.',
      },
      {
        chapter_number: 1,
        page_number: 1,
        paragraph_number: 2,
        sentence_number: 1,
        sentence_text: 'Te kuri haere ana.',
      },
    ]
    const tokens = uniqueMiWordTokensFromMiDrafts(drafts)
    expect(tokens.has('te')).toBe(true)
    expect(tokens.has('kuri')).toBe(true)
    expect(tokens.size).toBeGreaterThan(3)
  })
})
