import { describe, expect, it } from 'vitest'
import { enumerateLangSpansLive, splitPastedBilingual } from './splitPastedBilingual'

describe('splitPastedBilingual', () => {
  it('buckets Māori vs English when only single newlines between lines (no blank lines)', () => {
    const raw = `Ko te kupu tuatahi te reo Māori.
The man went to the house with his dog.`
    const r = splitPastedBilingual(raw, 1)
    expect(r.method).toBe('paragraph-classify')
    expect(r.mi).toContain('Ko te kupu')
    expect(r.en).toContain('The man went')
    expect(r.mi).not.toContain('The man went')
  })

  it('classifies each paragraph by language when separated by blank lines (no Mi-then-En slot assumption)', () => {
    const raw = `Ko te kupu tuatahi te reo Māori.

First English paragraph.
`
    const r = splitPastedBilingual(raw, 1)
    expect(r.method).toBe('paragraph-classify')
    expect(r.mi).toContain('Ko te kupu')
    expect(r.en).toContain('First English')
  })

  it('classifies fiction dialogue spans by language cues, not only paragraph blobs', () => {
    const raw = `'Well,' said Dumbledore finally, 'that's that. We've no business staying here.'
'Yeah,' said Hagrid in a very muffled voice. 'I'd best get this bike away. G'night, Professor McGonagall – Professor Dumbledore, sir.'`
    const r = splitPastedBilingual(raw, 1)
    expect(r.method).toBe('paragraph-classify')
    expect(r.mi.trim()).toBe('')
    expect(r.en.toLowerCase()).toContain('dumbledore')
    expect(r.en.toLowerCase()).toContain('hagrid')
    expect(r.mi.toLowerCase()).not.toContain('dumbledore')
  })

  it('keeps wrapped English prose together (Mr./Mrs., soft line breaks, sentence splits)', () => {
    const raw = `Mr. and Mrs. Dursley, of number four, Privet Drive, were
proud to say that they were perfectly normal, thank you very much. They were the last people you'd expect to be involved in anything strange or mysterious, because they just didn't hold with such nonsense.`
    const spans = enumerateLangSpansLive(raw)
    expect(spans.every((s) => s.lang === 'en')).toBe(true)
    expect(spans.some((s) => s.text.includes('Mr. and Mrs.'))).toBe(true)
    expect(spans.some((s) => s.text.includes("didn't hold"))).toBe(true)
    expect(spans.some((s) => s.text.trimStart().startsWith('and Mrs.'))).toBe(false)
  })

  it('enumerateLangSpansLive classifies each span independently', () => {
    const paired = `Ko te tuatahi.

First English block.
`
    const live = enumerateLangSpansLive(paired)
    expect(live.some((s) => s.lang === 'mi')).toBe(true)
    expect(live.some((s) => s.lang === 'en')).toBe(true)

    const classifyOnly = enumerateLangSpansLive('The dog ran fast.')
    expect(classifyOnly.every((s) => s.lang === 'en')).toBe(true)
  })
})
