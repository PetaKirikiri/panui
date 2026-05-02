import type { SupabaseClient } from '@supabase/supabase-js'
import type { SentenceInsertDraft } from './bilingualPaste'
import { formatSupabaseError } from './formatSupabaseError'
import { syncMiWordTokensFromMiDrafts } from './syncMiWordsToRegistry'

async function syncWordRegistryBestEffort(
  client: SupabaseClient,
  miDrafts: SentenceInsertDraft[],
): Promise<void> {
  try {
    await syncMiWordTokensFromMiDrafts(client, miDrafts)
  } catch (e) {
    console.warn('[word_registry] sync skipped:', formatSupabaseError(e))
  }
}

function throwFormatted(err: unknown): never {
  throw new Error(formatSupabaseError(err))
}

async function getStorySourcesByLanguage(
  client: SupabaseClient,
  titleId: number,
  versionId: number,
): Promise<{ en: number | null; mi: number | null }> {
  const { data, error } = await client
    .from('story_sources')
    .select('id, language')
    .eq('title_id', titleId)
    .eq('version_id', versionId)
    .in('language', ['en', 'mi'])

  if (error) throwFormatted(error)
  const rows = data ?? []
  const en = rows.find((r) => r.language === 'en')?.id ?? null
  const mi = rows.find((r) => r.language === 'mi')?.id ?? null
  return { en, mi }
}

async function ensureStorySource(
  client: SupabaseClient,
  args: {
    titleId: number
    versionId: number
    language: 'en' | 'mi'
    sourceText: string
  },
): Promise<number> {
  const { titleId, versionId, language, sourceText } = args
  const { data: found, error: selErr } = await client
    .from('story_sources')
    .select('id')
    .eq('title_id', titleId)
    .eq('version_id', versionId)
    .eq('language', language)
    .maybeSingle()

  if (selErr) throwFormatted(selErr)
  if (found?.id != null) return found.id as number

  const { data: inserted, error: insErr } = await client
    .from('story_sources')
    .insert({
      title_id: titleId,
      version_id: versionId,
      language,
      source_text: sourceText,
    })
    .select('id')
    .single()

  if (insErr) throwFormatted(insErr)
  return (inserted as { id: number }).id
}

async function deleteChapterSentences(
  client: SupabaseClient,
  storySourceId: number,
  chapterNumber: number,
): Promise<void> {
  const { error } = await client
    .from('story_sentences')
    .delete()
    .eq('story_source_id', storySourceId)
    .eq('chapter_number', chapterNumber)

  if (error) throwFormatted(error)
}

async function deletePageSentences(
  client: SupabaseClient,
  storySourceId: number,
  chapterNumber: number,
  pageNumber: number,
): Promise<void> {
  const { error } = await client
    .from('story_sentences')
    .delete()
    .eq('story_source_id', storySourceId)
    .eq('chapter_number', chapterNumber)
    .eq('page_number', pageNumber)

  if (error) throwFormatted(error)
}

async function insertSentencesBatch(
  client: SupabaseClient,
  args: {
    storySourceId: number
    titleId: number
    versionId: number
    drafts: SentenceInsertDraft[]
  },
): Promise<void> {
  const { storySourceId, titleId, versionId, drafts } = args
  if (drafts.length === 0) return

  const rows = drafts.map((d) => ({
    story_source_id: storySourceId,
    title_id: titleId,
    version_id: versionId,
    chapter_number: d.chapter_number,
    page_number: d.page_number,
    paragraph_number: d.paragraph_number,
    chunk_index: d.chunk_index ?? Math.max(0, d.paragraph_number - 1),
    sentence_number: d.sentence_number,
    sentence_text: d.sentence_text,
  }))

  const chunkSize = 200
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await client.from('story_sentences').insert(chunk)
    if (error) throwFormatted(error)
  }
}

async function recomputeSourceText(client: SupabaseClient, storySourceId: number): Promise<string> {
  const { data, error } = await client
    .from('story_sentences')
    .select(
      'sentence_text, chapter_number, page_number, paragraph_number, sentence_number, chunk_index',
    )
    .eq('story_source_id', storySourceId)
    .order('chapter_number', { ascending: true })
    .order('page_number', { ascending: true })
    .order('chunk_index', { ascending: true })
    .order('paragraph_number', { ascending: true })
    .order('sentence_number', { ascending: true })

  if (error) throwFormatted(error)
  const texts = (data ?? []).map((r: { sentence_text: string }) => r.sentence_text)
  return texts.join('\n\n')
}

export type ImportChapterArgs = {
  titleId: number
  versionId: number
  chapterNumber: number
  enDrafts: SentenceInsertDraft[]
  miDrafts: SentenceInsertDraft[]
}

export type ReplaceReaderPageArgs = {
  titleId: number
  versionId: number
  chapterNumber: number
  pageNumber: number
  enDrafts: SentenceInsertDraft[]
  miDrafts: SentenceInsertDraft[]
}

/**
 * Replace imported chapter sentences for EN/MI sources and refresh `source_text` aggregates.
 * After success, registers unique Māori tokens from MI drafts into `word_registry` (best-effort;
 * skipped if RLS denies inserts — see {@link syncMiWordTokensFromMiDrafts}).
 *
 * Pass a client created with the **service role** key from a trusted script to bypass RLS; the
 * browser uses the anon key (needs matching RLS policies for inserts/updates/deletes).
 */
export async function importChapterWithClient(
  client: SupabaseClient,
  args: ImportChapterArgs,
): Promise<void> {
  const { titleId, versionId, chapterNumber, enDrafts, miDrafts } = args

  let enSourceId = (await getStorySourcesByLanguage(client, titleId, versionId)).en
  let miSourceId = (await getStorySourcesByLanguage(client, titleId, versionId)).mi

  const placeholder = ''

  if (enSourceId == null) {
    enSourceId = await ensureStorySource(client, {
      titleId,
      versionId,
      language: 'en',
      sourceText: placeholder,
    })
  }
  if (miSourceId == null) {
    miSourceId = await ensureStorySource(client, {
      titleId,
      versionId,
      language: 'mi',
      sourceText: placeholder,
    })
  }

  await Promise.all([
    deleteChapterSentences(client, enSourceId, chapterNumber),
    deleteChapterSentences(client, miSourceId, chapterNumber),
  ])

  await Promise.all([
    insertSentencesBatch(client, {
      storySourceId: enSourceId,
      titleId,
      versionId,
      drafts: enDrafts,
    }),
    insertSentencesBatch(client, {
      storySourceId: miSourceId,
      titleId,
      versionId,
      drafts: miDrafts,
    }),
  ])

  const [enText, miText] = await Promise.all([
    recomputeSourceText(client, enSourceId),
    recomputeSourceText(client, miSourceId),
  ])

  const { error: enUpErr } = await client
    .from('story_sources')
    .update({ source_text: enText })
    .eq('id', enSourceId)
  if (enUpErr) throwFormatted(enUpErr)

  const { error: miUpErr } = await client
    .from('story_sources')
    .update({ source_text: miText })
    .eq('id', miSourceId)
  if (miUpErr) throwFormatted(miUpErr)

  await syncWordRegistryBestEffort(client, miDrafts)
}

/**
 * Replace sentences for a single chapter + page on both EN and MI sources, then refresh
 * `source_text`. Same RLS/service-role considerations as {@link importChapterWithClient}.
 * Registers MI tokens into `word_registry` after success (best-effort).
 */
export async function replaceReaderPageWithClient(
  client: SupabaseClient,
  args: ReplaceReaderPageArgs,
): Promise<void> {
  const { titleId, versionId, chapterNumber, pageNumber, enDrafts, miDrafts } = args

  let enSourceId = (await getStorySourcesByLanguage(client, titleId, versionId)).en
  let miSourceId = (await getStorySourcesByLanguage(client, titleId, versionId)).mi

  const placeholder = ''

  if (enSourceId == null) {
    enSourceId = await ensureStorySource(client, {
      titleId,
      versionId,
      language: 'en',
      sourceText: placeholder,
    })
  }
  if (miSourceId == null) {
    miSourceId = await ensureStorySource(client, {
      titleId,
      versionId,
      language: 'mi',
      sourceText: placeholder,
    })
  }

  await Promise.all([
    deletePageSentences(client, enSourceId, chapterNumber, pageNumber),
    deletePageSentences(client, miSourceId, chapterNumber, pageNumber),
  ])

  await Promise.all([
    insertSentencesBatch(client, {
      storySourceId: enSourceId,
      titleId,
      versionId,
      drafts: enDrafts,
    }),
    insertSentencesBatch(client, {
      storySourceId: miSourceId,
      titleId,
      versionId,
      drafts: miDrafts,
    }),
  ])

  const [enText, miText] = await Promise.all([
    recomputeSourceText(client, enSourceId),
    recomputeSourceText(client, miSourceId),
  ])

  const { error: enUpErr } = await client
    .from('story_sources')
    .update({ source_text: enText })
    .eq('id', enSourceId)
  if (enUpErr) throwFormatted(enUpErr)

  const { error: miUpErr } = await client
    .from('story_sources')
    .update({ source_text: miText })
    .eq('id', miSourceId)
  if (miUpErr) throwFormatted(miUpErr)

  await syncWordRegistryBestEffort(client, miDrafts)
}

export type WipeChapterArgs = {
  titleId: number
  versionId: number
  chapterNumber: number
}

/**
 * Deletes bilingual sentence rows for this chapter number (EN + MI) and refreshes `source_text`.
 * Title/version/chapter slots are unchanged—you replace content by importing again.
 */
export async function wipeChapterSentencesWithClient(
  client: SupabaseClient,
  args: WipeChapterArgs,
): Promise<void> {
  const { titleId, versionId, chapterNumber } = args

  const { en: enSourceId, mi: miSourceId } = await getStorySourcesByLanguage(
    client,
    titleId,
    versionId,
  )

  if (enSourceId == null || miSourceId == null) {
    throw new Error('Missing English or Māori story source for this title/version.')
  }

  await Promise.all([
    deleteChapterSentences(client, enSourceId, chapterNumber),
    deleteChapterSentences(client, miSourceId, chapterNumber),
  ])

  const [enText, miText] = await Promise.all([
    recomputeSourceText(client, enSourceId),
    recomputeSourceText(client, miSourceId),
  ])

  const { error: enUpErr } = await client
    .from('story_sources')
    .update({ source_text: enText })
    .eq('id', enSourceId)
  if (enUpErr) throwFormatted(enUpErr)

  const { error: miUpErr } = await client
    .from('story_sources')
    .update({ source_text: miText })
    .eq('id', miSourceId)
  if (miUpErr) throwFormatted(miUpErr)
}
