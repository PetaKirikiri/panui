/**
 * Import a pasted chapter using the service role key (bypasses RLS).
 *
 * Usage:
 *   npx tsx scripts/import-chapter.ts <titleId> <versionId> <chapterNumber> <path-to-text-file>
 *
 * Requires in .env:
 *   VITE_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY — Project Settings → API → service_role (never commit or expose to browser)
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { parseBilingualPaste, segmentsToSentenceDrafts } from '../src/lib/bilingualPaste.ts'
import { importChapterWithClient } from '../src/lib/importChapterCore.ts'

config({ path: '.env' })
config({ path: '.env.local', override: true })

const url = process.env.VITE_SUPABASE_URL?.trim() ?? process.env.SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

const [, , titleArg, versionArg, chapterArg, fileArg] = process.argv

async function main(): Promise<void> {
  if (!url || !serviceKey) {
    console.error(
      'Set VITE_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env — see scripts/import-chapter.ts header.',
    )
    process.exit(1)
  }

  if (!titleArg || !versionArg || !chapterArg || !fileArg) {
    console.error(
      'Usage: npx tsx scripts/import-chapter.ts <titleId> <versionId> <chapterNumber> <path-to-text-file>',
    )
    process.exit(1)
  }

  const titleId = Number(titleArg)
  const versionId = Number(versionArg)
  const chapterNumber = Number(chapterArg)

  if (!Number.isFinite(titleId) || !Number.isFinite(versionId) || !Number.isFinite(chapterNumber)) {
    console.error('titleId, versionId, and chapterNumber must be numbers.')
    process.exit(1)
  }

  const abs = path.resolve(process.cwd(), fileArg)
  const paste = fs.readFileSync(abs, 'utf8')

  const parsed = parseBilingualPaste(paste, chapterNumber)
  if (parsed.segments.length === 0) {
    console.error('No segments parsed — fix paste format (paired EN/MI paragraphs).')
    process.exit(1)
  }

  const drafts = segmentsToSentenceDrafts(parsed.segments, chapterNumber)

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  await importChapterWithClient(client, {
    titleId,
    versionId,
    chapterNumber,
    enDrafts: drafts.en,
    miDrafts: drafts.mi,
  })

  console.log(`Imported ${parsed.segments.length} paragraph pairs for chapter ${chapterNumber}.`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
