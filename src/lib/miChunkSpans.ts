import { MI_WORD_TOKEN_RE, normalizeWordRegistrySurface } from './miWordTokens'

export type MiChunkSegment =
  | { kind: 'word'; raw: string; lemma: string }
  | { kind: 'text'; value: string }

/** Split Māori chunk prose into spans: lookup-eligible words vs other (spaces, punctuation). */
export function miChunkSegments(text: string): MiChunkSegment[] {
  const out: MiChunkSegment[] = []
  let last = 0
  MI_WORD_TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MI_WORD_TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: 'text', value: text.slice(last, m.index) })
    const raw = m[0]
    const lemma = normalizeWordRegistrySurface(raw)
    if (lemma.length >= 2) out.push({ kind: 'word', raw, lemma })
    else out.push({ kind: 'text', value: raw })
    last = m.index + raw.length
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) })
  return out
}
