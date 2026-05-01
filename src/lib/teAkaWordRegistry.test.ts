import { describe, expect, it } from 'vitest'
import {
  fixSquashedLeadingPos,
  formatTeAkaTooltipDefinition,
  maybeSplitEmbeddedEnglishExample,
  sanitizeTeAkaDisplayText,
} from './teAkaWordRegistry'

describe('fixSquashedLeadingPos', () => {
  it('splits POS jammed onto English', () => {
    expect(fixSquashedLeadingPos("particleWhat's that town?", 'particle')).toBe("What's that town?")
    expect(fixSquashedLeadingPos('particleCross to the island', 'particle')).toBe(
      'Cross to the island',
    )
  })

  it('keeps normal spacing after POS word', () => {
    expect(fixSquashedLeadingPos('particle (extra)', 'particle')).toBe('particle (extra)')
  })
})

describe('formatTeAkaTooltipDefinition', () => {
  it('repairs squashed Edge strings', () => {
    expect(
      formatTeAkaTooltipDefinition({
        pos: 'particle',
        definition: "particleWhat's that town?",
      }),
    ).toBe("What's that town?")
  })

  it('strips leading parenthetical POS', () => {
    expect(
      formatTeAkaTooltipDefinition({
        pos: 'particle',
        definition: '(particle) A particle with no English equivalent.',
      }),
    ).toBe('A particle with no English equivalent.')
  })

  it('decodes HTML entities in definitions', () => {
    expect(
      formatTeAkaTooltipDefinition({
        pos: 'interjection',
        definition: 'I totally agree,&nbsp;yes indeed,&nbsp;positively.',
      }),
    ).toBe('I totally agree, yes indeed, positively.')
  })
})

describe('sanitizeTeAkaDisplayText', () => {
  it('decodes nbsp entities and normalizes spaces', () => {
    expect(sanitizeTeAkaDisplayText('a,&nbsp;b,&nbsp;c')).toBe('a, b, c')
    expect(sanitizeTeAkaDisplayText('x\u00a0y')).toBe('x y')
  })
})

describe('maybeSplitEmbeddedEnglishExample', () => {
  it('separates glued dialogue after gloss', () => {
    const input =
      'I totally agree, yes indeed, agreed, positively — used to show strong agreement with a statement. This mutton bird is really tasty!'
    expect(maybeSplitEmbeddedEnglishExample(input)).toEqual({
      definition:
        'I totally agree, yes indeed, agreed, positively — used to show strong agreement with a statement.',
      embeddedExample: 'This mutton bird is really tasty!',
    })
  })
})
