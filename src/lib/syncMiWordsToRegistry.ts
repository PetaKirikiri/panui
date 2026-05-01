import type { SupabaseClient } from '@supabase/supabase-js'
import type { SentenceInsertDraft } from './bilingualPaste'
import { extractUniqueMiWordTokens } from './miWordTokens'

/** Chunk size for `word_registry` inserts — matches bulk script behaviour */
export const WORD_REGISTRY_UPSERT_CHUNK = 150

const DEFAULT_ROW = {
  language: 'mi',
  pos_types: [] as unknown[],
  metadata: {},
  short_glosses_by_pos: {},
} as const

/**
 * Upserts unique Māori tokens into `public.word_registry` (ignore duplicates on PK).
 * Intended for the browser Supabase client after bilingual imports when RLS allows inserts.
 */
export async function upsertWordRegistryTokens(
  client: SupabaseClient,
  tokens: Set<string>,
): Promise<number> {
  if (tokens.size === 0) return 0
  const sorted = [...tokens].sort((a, b) => a.localeCompare(b))
  let written = 0
  for (let i = 0; i < sorted.length; i += WORD_REGISTRY_UPSERT_CHUNK) {
    const slice = sorted.slice(i, i + WORD_REGISTRY_UPSERT_CHUNK)
    const rows = slice.map((word_text) => ({
      word_text,
      ...DEFAULT_ROW,
    }))
    const { error } = await client.from('word_registry').upsert(rows, {
      onConflict: 'word_text',
      ignoreDuplicates: true,
    })
    if (error) throw error
    written += slice.length
  }
  return written
}

export function uniqueMiWordTokensFromMiDrafts(miDrafts: SentenceInsertDraft[]): Set<string> {
  const texts = miDrafts.map((d) => d.sentence_text)
  return extractUniqueMiWordTokens(...texts)
}

/** Registers tokens from newly imported Māori sentence drafts (chapter / reader page). */
export async function syncMiWordTokensFromMiDrafts(
  client: SupabaseClient,
  miDrafts: SentenceInsertDraft[],
): Promise<number> {
  const tokens = uniqueMiWordTokensFromMiDrafts(miDrafts)
  return upsertWordRegistryTokens(client, tokens)
}
