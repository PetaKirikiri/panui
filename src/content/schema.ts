import { z } from 'zod'

/** Paragraphs may be a single string or one paragraph per array element. */
const paragraphsField = z.union([z.string(), z.array(z.string())]).transform((v) =>
  typeof v === 'string' ? [v] : v,
)

/** Per sentence token row — mirrors Pūrākau `story_sentences.tokens_array`. */
export const sentenceTokenSchema = z.object({
  index: z.number(),
  text: z.string(),
  pos_type_id: z.number().nullable(),
  word_pos_entry_id: z.number().nullable(),
})

export const readingBatchSchema = z.object({
  id: z.string(),
  order: z.number().int(),
  label: z.string().optional(),
  english: paragraphsField,
  maori: paragraphsField,
  /** POS-tagged Māori tokens per paragraph (parallel to `maori`), when loaded from Supabase. */
  miTokens: z.array(z.array(sentenceTokenSchema)).optional(),
})

export const chapterManifestSchema = z.object({
  bookId: z.string(),
  chapterId: z.string(),
  title: z.string().optional(),
  batches: z.array(readingBatchSchema),
})

export type ReadingBatch = z.infer<typeof readingBatchSchema>
export type ChapterManifest = z.infer<typeof chapterManifestSchema>

export function parseChapterManifest(raw: unknown): ChapterManifest {
  return chapterManifestSchema.parse(raw)
}
