import { asciiFoldMaoriWordRegistryKey, normalizeWordRegistrySurface } from './miWordTokens'
import { supabase } from './supabase'

const BATCH = 80

/** Returns lemmas that exist as `word_registry.word_text`. */
export async function fetchWordRegistryPresence(lemmas: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  const unique = [...new Set(lemmas.map(normalizeWordRegistrySurface).filter((l) => l.length >= 2))]
  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH)
    const { data, error } = await supabase.from('word_registry').select('word_text').in('word_text', slice)
    if (error) throw error
    const rows = data ?? []
    for (const row of rows) {
      const w = (row as { word_text: string }).word_text
      if (typeof w === 'string') out.add(w)
    }
  }

  const missing = unique.filter((l) => !out.has(l))
  const foldToCanon = new Map<string, string[]>()
  for (const canon of missing) {
    const fold = asciiFoldMaoriWordRegistryKey(canon)
    if (fold === canon) continue
    const arr = foldToCanon.get(fold) ?? []
    arr.push(canon)
    foldToCanon.set(fold, arr)
  }
  const foldKeys = [...foldToCanon.keys()]
  if (foldKeys.length > 0) {
    for (let i = 0; i < foldKeys.length; i += BATCH) {
      const slice = foldKeys.slice(i, i + BATCH)
      const { data, error } = await supabase.from('word_registry').select('word_text').in('word_text', slice)
      if (error) throw error
      for (const row of data ?? []) {
        const w = (row as { word_text: string }).word_text
        if (typeof w !== 'string') continue
        const canons = foldToCanon.get(w)
        if (!canons) continue
        for (const c of canons) out.add(c)
      }
    }
  }

  return out
}
