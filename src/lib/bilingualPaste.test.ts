import { describe, expect, it } from 'vitest'
import {
  classifyBlockLang,
  normalizePairedParagraphColumns,
  parseBilingualPaste,
  segmentsToSentenceDrafts,
  stripLeadingPageFromText,
  unwrapEditorialBlock,
} from './bilingualPaste'

describe('stripLeadingPageFromText', () => {
  it('strips Page N on the same line as prose', () => {
    const { text, pageNumber } = stripLeadingPageFromText(
      'Page 1 Whakaī ana a Mita rāua ko Miha Tūhiri, nō te kāinga tuawhā.',
    )
    expect(pageNumber).toBe(1)
    expect(text.startsWith('Whakaī')).toBe(true)
    expect(text).not.toMatch(/^Page/i)
  })

  it('returns unchanged when no page prefix', () => {
    const { text, pageNumber } = stripLeadingPageFromText('Ko te kupu tuatahi.')
    expect(pageNumber).toBeNull()
    expect(text).toBe('Ko te kupu tuatahi.')
  })
})

describe('unwrapEditorialBlock', () => {
  it('returns Māori body after Additional info on same line', () => {
    const { text, warning } = unwrapEditorialBlock(
      'Additional info: ka haere ia ki te toa hoko ai.',
    )
    expect(text).toContain('ka haere')
    expect(warning).toMatch(/Imported body/i)
  })
})

describe('classifyBlockLang', () => {
  it('detects te reo without macrons via lexicon and phrases', () => {
    expect(classifyBlockLang('Ko te tangata te haere ki te whare.')).toBe('mi')
    expect(classifyBlockLang('The man went to the house with his dog.')).toBe('en')
  })

  it('prefers te reo for ka/kua shells when scores tie', () => {
    expect(classifyBlockLang('Ka haere rātou ki te kāinga.')).toBe('mi')
    expect(classifyBlockLang('Kua mutu te mahi ināianei.')).toBe('mi')
  })

  it('still favours macrons when scores tie', () => {
    expect(classifyBlockLang('Ā')).toBe('mi')
  })
})

describe('extractQuotedTeReoFromEnglish', () => {
  it('pulls te reo inside straight quotes out of English narrative without breaking contractions', () => {
    const mi = `Kua wareware noa atu i a ia ngā tāngata mau tūpuni.`

    const mixed = `They didn't think they could bear it if anyone found out about the Potters. 'Ngā Pota, āna, koirā tāku i rongo ai -' '- āe, tā rāua tama, a Hare -' Mrs Dursley screamed.`

    const { segments, warnings } = parseBilingualPaste(`${mi}\n\n${mixed}`, 1)

    expect(segments).toHaveLength(1)
    expect(segments[0].english).not.toMatch(/Ngā Pota/)
    expect(segments[0].english).toContain(`didn't`)
    expect(segments[0].maori).toContain('Ngā Pota')
    expect(segments[0].maori).toContain('wareware')
    expect(warnings.some((w) => w.includes('Moved quoted te reo'))).toBe(true)
  })
})

describe('normalizePairedParagraphColumns', () => {
  it('swaps when English prose was stored under maori and te reo under english', () => {
    const out = normalizePairedParagraphColumns(
      'Ko te whare te rahi, ā, kātahi te haahi o te tāone;',
      'The house was huge and old, and the church across the road was ringing.',
    )
    expect(out.english).toContain('The house was huge')
    expect(out.maori).toContain('Ko te whare')
  })

  it('does not swap correctly aligned pairs', () => {
    const out = normalizePairedParagraphColumns(
      'The house was huge and old.',
      'Ko te whare te rahi, otirā te tawhito.',
    )
    expect(out.english).toContain('The house')
    expect(out.maori).toContain('Ko te whare')
  })
})

describe('parseBilingualPaste', () => {
  it('pairs alternating Māori (macrons) and English and respects Page markers', () => {
    const raw = `Ko te kupu tuatahi te reo Māori.

First English paragraph.

Page 2

Ko te tuarua te rēo Māori.

Second English paragraph.
`

    const { warnings, segments, batches } = parseBilingualPaste(raw, 1)

    expect(warnings.length).toBe(0)
    expect(segments).toHaveLength(2)

    expect(segments[0]).toMatchObject({
      pageNumber: 1,
      paragraphNumber: 1,
      english: 'First English paragraph.',
      maori: 'Ko te kupu tuatahi te reo Māori.',
    })

    expect(segments[1]).toMatchObject({
      pageNumber: 2,
      paragraphNumber: 1,
      english: 'Second English paragraph.',
      maori: 'Ko te tuarua te rēo Māori.',
    })

    expect(batches).toHaveLength(2)
    expect(batches[0].label).toContain('Page 1')
    expect(batches[1].label).toContain('Page 2')
  })

  it('detects Page N merged into the start of a paragraph block', () => {
    const raw = `Page 1 Ko te kupu tuatahi te reo Māori.

First English paragraph.

Page 2 Ko te tuarua te rēo Māori.

Second English paragraph.
`

    const { segments } = parseBilingualPaste(raw, 1)
    expect(segments[0].pageNumber).toBe(1)
    expect(segments[0].maori).toContain('Ko te kupu')
    expect(segments[0].maori).not.toMatch(/Page\s+1/i)
    expect(segments[1].pageNumber).toBe(2)
    expect(segments[1].maori).not.toMatch(/Page\s+2/i)
  })

  it('does not warn when standalone Page sits between Māori and English', () => {
    const raw = `Ko te kupu tuatahi te reo Māori.

Page 18

The cat sat on the mat and looked up.

Ko te tuarua te rēo Māori.

Second English paragraph.
`

    const { segments, warnings } = parseBilingualPaste(raw, 1)

    expect(warnings.some((w) => w.includes('Pair spans different'))).toBe(false)
    expect(segments[0].pageNumber).toBe(18)
    expect(segments[0].english).toContain('cat sat')
    expect(segments[1].pageNumber).toBe(18)
    expect(segments[1].english).toContain('Second English')
  })

  it('skips empty editorial-only blocks and continues pairing', () => {
    const raw = `Āe te reo.

Yes in English.

Additional info:

Kē te kōrero Māori.

Extra English line.
`

    const { warnings, segments } = parseBilingualPaste(raw, 1)

    expect(warnings.some((w) => w.includes('Skipped empty editorial') || w.includes('additional info'))).toBe(
      true,
    )
    expect(segments).toHaveLength(2)
    expect(segments[1].maori).toContain('Kē te kōrero')
  })

  it('pairs English-first blocks when classifier distinguishes languages', () => {
    const raw = `The small cat sat quietly until dusk.

Te potiki ngeru te noho ma nga wa katoa.

Page 2

Another English sentence with common words here.

Kei te mohio ahau kei te pai te korero.
`

    const { segments, warnings } = parseBilingualPaste(raw, 1)

    expect(warnings.filter((w) => w.includes('not EN+MI'))).toHaveLength(0)
    expect(segments).toHaveLength(2)
    expect(segments[0].english).toContain('The small cat')
    expect(segments[0].maori).toContain('Te potiki')
    expect(segments[1].english).toContain('Another English')
    expect(segments[1].maori).toContain('Kei te mohio')
  })
})

describe('segmentsToSentenceDrafts', () => {
  it('emits aligned EN/MI drafts per paragraph', () => {
    const raw = `Tēnā koe i te ata.

Hello.

Page 3

Āe, kei te pai ahau.

Hi there.
`

    const { segments } = parseBilingualPaste(raw, 2)
    const { en, mi } = segmentsToSentenceDrafts(segments, 2)

    expect(en).toHaveLength(2)
    expect(mi).toHaveLength(2)
    expect(en[0].chapter_number).toBe(2)
    expect(en[0].page_number).toBe(1)
    expect(mi[1].page_number).toBe(3)
    expect(en[0].paragraph_number).toBe(1)
    expect(mi[0].paragraph_number).toBe(1)
  })
})
