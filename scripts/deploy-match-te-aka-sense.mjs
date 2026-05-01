#!/usr/bin/env node
/**
 * Deploy `match-te-aka-sense` Edge Function using project ref from pānui `.env`.
 *
 * Usage: npm run functions:deploy:match-te-aka-sense
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

function projectRefFromUrl(url) {
  const m = String(url || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)
  return m ? m[1] : null
}

const local = parseEnvFile(path.join(ROOT, '.env'))
const ref =
  (local.SUPABASE_PROJECT_REF || '').trim() ||
  projectRefFromUrl(local.VITE_SUPABASE_URL)

if (!ref) {
  console.error(
    'Set SUPABASE_PROJECT_REF or VITE_SUPABASE_URL in .env, or run: npx supabase link',
  )
  process.exit(1)
}

const r = spawnSync(
  'npx',
  ['--yes', 'supabase', 'functions', 'deploy', 'match-te-aka-sense', '--project-ref', ref],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env } },
)
process.exit(r.status ?? 1)
