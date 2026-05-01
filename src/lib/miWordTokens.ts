/**
 * Māori word tokens for `word_registry.word_text`.
 *
 * Storage policy (aligned with live DB + Pūrākau usage):
 * - **Primary key `word_text`** is orthographic: NFC-normalised, lowercased surface form (macrons preserved),
 *   e.g. `āhuatanga`, `tūī`. The DB does **not** composite with `language`; default `language='mi'` applies.
 * - Tokens are extracted from running story text (sentences / sources); ASCII-folded matching is *not* used for keys.
 */

/** Letters incl. macrons — match {@link TOKEN_RE} in bilingualPaste heuristics */
export const MI_WORD_TOKEN_RE = /[a-zA-ZāēīōūĀĒĪŌŪ]+/gu

/** NFC lowercase surface key suitable for `word_registry.word_text`. */
export function normalizeWordRegistrySurface(raw: string): string {
  return raw.normalize('NFC').toLowerCase().trim()
}

/**
 * Strip macrons for legacy DB rows stored without tohutō. Used only for presence fallback lookups,
 * not for primary keys or inserts.
 */
export function asciiFoldMaoriWordRegistryKey(key: string): string {
  return key
    .replace(/ā/g, 'a')
    .replace(/ē/g, 'e')
    .replace(/ī/g, 'i')
    .replace(/ō/g, 'o')
    .replace(/ū/g, 'u')
}

/**
 * Collect unique Māori-script tokens from prose (multiple paragraphs / sentences).
 */
export function extractUniqueMiWordTokens(...texts: string[]): Set<string> {
  const out = new Set<string>()
  const joined = texts.filter(Boolean).join('\n')
  if (!joined.trim()) return out

  MI_WORD_TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MI_WORD_TOKEN_RE.exec(joined)) !== null) {
    const key = normalizeWordRegistrySurface(m[0])
    if (key.length >= 2) out.add(key)
  }
  return out
}
