/**
 * Fix EN/MI paragraph columns in a static chapter manifest (same heuristic as parseBilingualPaste).
 *
 * Usage:
 *   npx tsx scripts/repair-chapter-json.ts content/harry-potter/book-1/chapter-04.json
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseChapterManifest } from '../src/content/schema.ts'
import { normalizePairedParagraphColumns } from '../src/lib/bilingualPaste.ts'

const [, , fileArg] = process.argv

function main(): void {
  if (!fileArg) {
    console.error('Usage: npx tsx scripts/repair-chapter-json.ts <path-to-chapter.json>')
    process.exit(1)
  }

  const abs = path.resolve(process.cwd(), fileArg)
  const raw = fs.readFileSync(abs, 'utf8')
  const manifest = parseChapterManifest(JSON.parse(raw))

  const batches = manifest.batches.map((b) => {
    const en = [...b.english]
    const mi = [...b.maori]
    const n = Math.max(en.length, mi.length)
    for (let i = 0; i < n; i++) {
      const aligned = normalizePairedParagraphColumns(en[i] ?? '', mi[i] ?? '')
      en[i] = aligned.english
      mi[i] = aligned.maori
    }
    return { ...b, english: en, maori: mi }
  })

  const out = { ...manifest, batches }
  fs.writeFileSync(abs, `${JSON.stringify(out, null, 2)}\n`, 'utf8')
  console.log(`Repaired ${manifest.chapterId}: ${batches.length} batch(es) in ${abs}`)
}

main()
