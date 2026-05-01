import { describe, expect, it } from 'vitest'
import { asciiFoldMaoriWordRegistryKey, extractUniqueMiWordTokens, normalizeWordRegistrySurface } from './miWordTokens'

describe('miWordTokens', () => {
  it('normalises NFC lowercase surface keys', () => {
    expect(normalizeWordRegistrySurface('Āe')).toBe('āe')
  })

  it('extracts unique tokens from Māori prose', () => {
    const s = extractUniqueMiWordTokens(
      'Ko te kupu tuatahi te reo Māori.\nTe tuarua rānei.',
    )
    expect(s.has('ko')).toBe(true)
    expect(s.has('tuatahi')).toBe(true)
    expect(s.has('māori')).toBe(true)
  })

  it('drops single-letter tokens', () => {
    const s = extractUniqueMiWordTokens('a i .')
    expect(s.has('a')).toBe(false)
    expect(s.has('i')).toBe(false)
  })

  it('ascii-folds macrons for lookup fallback', () => {
    expect(asciiFoldMaoriWordRegistryKey('māori')).toBe('maori')
    expect(asciiFoldMaoriWordRegistryKey('ko')).toBe('ko')
  })
})
