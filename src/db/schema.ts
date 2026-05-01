import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  unique,
  jsonb,
} from 'drizzle-orm/pg-core'

/** Token shape for story_sentences.tokens_array JSONB — aligned with Pūrākau. */
export type SentenceToken = {
  index: number
  text: string
  pos_type_id: number | null
  word_pos_entry_id: number | null
}

export type ConnectorGender = 'male' | 'female' | 'none'

/** Optional surface checks for chunk patterns (slot = index in matched token slice). */
export type ChunkPatternSurfaceRule = {
  slot: number
  normalize?: 'lower' | 'nfc' | 'nfc_lower'
  in: string[]
}

/** How a matched pos_chunk_patterns span is drawn. */
export type ChunkPatternPresentation = {
  layout?: 'default' | 'tense_marker_wrap'
  head_slot?: number
  core_slot?: number
  tail_slot?: number
  surface?: ChunkPatternSurfaceRule[]
}

export type ConnectorShapeConfig = {
  type?: 'flat' | 'round' | 'bevel' | 'notch' | 'arrow' | 'koru' | 'wave'
  gender?: ConnectorGender
  radius?: number
  inset?: number
  tipLength?: number
  tipWidth?: number
  angle?: number
  asymmetry?: number
  notchDepth?: number
  arcControl?: number
}

/** Starter table — optional migrations may reference it */
export const appMeta = pgTable('app_meta', {
  id: serial('id').primaryKey(),
})

/** Mirrors Pūrākaukau — existing Supabase tables */
export const titles = pgTable('titles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  author: text('author'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const storyVersions = pgTable(
  'story_versions',
  {
    id: serial('id').primaryKey(),
    titleId: integer('title_id')
      .notNull()
      .references(() => titles.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    label: text('label').notNull(),
    basedOnVersionId: integer('based_on_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.titleId, t.versionNumber)],
)

export const storySources = pgTable(
  'story_sources',
  {
    id: serial('id').primaryKey(),
    titleId: integer('title_id')
      .notNull()
      .references(() => titles.id, { onDelete: 'cascade' }),
    versionId: integer('version_id').references(() => storyVersions.id, { onDelete: 'cascade' }),
    sourceText: text('source_text').notNull(),
    language: text('language').notNull().default('mi'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.titleId, t.language, t.versionId)],
)

export const storySentences = pgTable('story_sentences', {
  id: serial('id').primaryKey(),
  storySourceId: integer('story_source_id').references(() => storySources.id, { onDelete: 'cascade' }),
  titleId: integer('title_id').references(() => titles.id, { onDelete: 'cascade' }),
  versionId: integer('version_id').references(() => storyVersions.id, { onDelete: 'cascade' }),
  chapterNumber: integer('chapter_number'),
  pageNumber: integer('page_number'),
  paragraphNumber: integer('paragraph_number'),
  sentenceNumber: integer('sentence_number'),
  sentenceText: text('sentence_text').notNull(),
  tokensArray: jsonb('tokens_array').$type<SentenceToken[] | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
