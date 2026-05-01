/**
 * Scan Māori story content (story_sources + story_sentences) and upsert unique tokens into `word_registry`.
 * Optionally enrich via Edge `lookup-te-aka`, and optionally attach words to a course (`course_words`).
 *
 * Env:
 *   VITE_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY — inserts / updates (required)
 *   VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY — Te Aka Edge POST only (required when --te-aka)
 *
 * Usage:
 *   npx tsx scripts/sync-mi-words-to-registry.ts [--dry-run] [--limit N] [--te-aka] [--te-aka-force] [--course-id ID --pos-type-id ID]
 */
import process from 'node:process'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { extractUniqueMiWordTokens } from '../src/lib/miWordTokens.ts'
import { upsertWordRegistryTokens } from '../src/lib/syncMiWordsToRegistry.ts'
import {
  buildWordRegistryTeAkaUpdate,
  lookupTeAkaEdge,
} from '../src/lib/teAkaWordRegistry.ts'

config({ path: '.env' })
config({ path: '.env.local', override: true })

const PAGE = 500

function argvFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function argvStr(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return null
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchAllMiSources(client: ReturnType<typeof createClient>): Promise<
  { id: number; source_text: string }[]
> {
  const out: { id: number; source_text: string }[] = []
  let from = 0
  for (;;) {
    const { data, error } = await client
      .from('story_sources')
      .select('id, source_text')
      .eq('language', 'mi')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    out.push(...(data as { id: number; source_text: string }[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

async function fetchSentenceTextsForSourceIds(
  client: ReturnType<typeof createClient>,
  ids: number[],
): Promise<string[]> {
  const texts: string[] = []
  const chunk = 60
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk)
    const { data, error } = await client
      .from('story_sentences')
      .select('sentence_text')
      .in('story_source_id', part)
    if (error) throw error
    for (const row of data ?? []) {
      const t = (row as { sentence_text: string }).sentence_text
      if (typeof t === 'string' && t.trim()) texts.push(t)
    }
  }
  return texts
}

async function main(): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL?.trim() ?? process.env.SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim() ?? process.env.SUPABASE_ANON_KEY?.trim()

  const dryRun = argvFlag('dry-run')
  const teAka = argvFlag('te-aka')
  const teAkaForce = argvFlag('te-aka-force')
  const limitWords = argvStr('limit')
  const courseIdStr = argvStr('course-id')
  const posTypeIdStr = argvStr('pos-type-id')

  if (!url || !serviceKey) {
    console.error(
      'Set VITE_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY — see scripts/sync-mi-words-to-registry.ts header.',
    )
    process.exit(1)
  }
  if (teAka && !anonKey) {
    console.error('--te-aka requires VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY for Edge invoke.')
    process.exit(1)
  }
  if ((courseIdStr && !posTypeIdStr) || (!courseIdStr && posTypeIdStr)) {
    console.error('Use both --course-id and --pos-type-id together, or omit both.')
    process.exit(1)
  }

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('Loading Māori story_sources…')
  const sources = await fetchAllMiSources(client)
  const sourceTexts = sources.map((s) => s.source_text)
  const ids = sources.map((s) => s.id)

  console.log('Loading story_sentences for MI sources…')
  const sentenceTexts = await fetchSentenceTextsForSourceIds(client, ids)

  const corpus = [...sourceTexts, ...sentenceTexts]
  const tokenSet = extractUniqueMiWordTokens(...corpus)
  let tokens = [...tokenSet].sort((a, b) => a.localeCompare(b))

  const lim = limitWords ? Math.max(1, parseInt(limitWords, 10)) : null
  if (lim) {
    tokens = tokens.slice(0, lim)
    console.log(`--limit ${lim}: processing first ${tokens.length} tokens (sorted).`)
  }

  console.log(`Unique Māori-script tokens: ${tokens.length}`)
  if (tokens.length === 0) {
    console.log('Nothing to do.')
    process.exit(0)
  }

  if (dryRun) {
    console.log('Dry run — no database writes.')
    if (tokens.length <= 40) console.log(tokens.join(', '))
    process.exit(0)
  }

  const inserted = await upsertWordRegistryTokens(client, new Set(tokens))
  console.log(`Registry upsert: ${inserted} token keys processed (${tokens.length} unique).`)

  if (teAka && anonKey) {
    console.log('Te Aka enrichment via lookup-te-aka…')
    let enriched = 0
    for (const word of tokens) {
      const { data: row } = await client
        .from('word_registry')
        .select('metadata')
        .eq('word_text', word)
        .maybeSingle()
      const meta = row?.metadata as Record<string, unknown> | undefined
      const fetched =
        meta &&
        typeof meta === 'object' &&
        typeof (meta as { te_aka?: { fetchedAt?: string } }).te_aka?.fetchedAt === 'string'
      if (fetched && !teAkaForce) {
        continue
      }

      const result = await lookupTeAkaEdge(url, anonKey, word)
      if (!result) {
        await sleep(120)
        continue
      }
      const { metadata: nextMeta, short_glosses_by_pos } = buildWordRegistryTeAkaUpdate(meta ?? {}, result)
      const { error: upErr } = await client
        .from('word_registry')
        .update({ metadata: nextMeta, short_glosses_by_pos })
        .eq('word_text', word)
      if (upErr) console.warn(word, upErr.message)
      else enriched++
      await sleep(150)
    }
    console.log(`Te Aka enriched rows: ${enriched}`)
  }

  if (courseIdStr && posTypeIdStr) {
    const courseId = Number(courseIdStr)
    const posTypeId = Number(posTypeIdStr)
    if (!Number.isFinite(courseId) || !Number.isFinite(posTypeId)) {
      console.error('--course-id and --pos-type-id must be numbers')
      process.exit(1)
    }
    console.log(`Linking tokens to course_words (course ${courseId}, pos ${posTypeId})…`)
    let linked = 0
    for (const word of tokens) {
      const { error } = await client.from('course_words').insert({
        course_id: courseId,
        word_text: word,
        pos_type_id: posTypeId,
      })
      if (!error) linked++
      else if (!/duplicate|unique/i.test(error.message)) console.warn(word, error.message)
      await sleep(20)
    }
    console.log(`course_words inserted (new rows): ~${linked}`)
  }

  console.log('Done.')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
