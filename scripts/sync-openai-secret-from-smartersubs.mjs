#!/usr/bin/env node
/**
 * Push OpenAI credentials from SmarterSubs or Pūrākau `.env` into **this repo’s** Supabase Edge secrets.
 * Used by `match-te-aka-sense` (OPENAI_MATCH_MODEL) and any function using OPENAI_API_KEY.
 * Does not print the API key.
 *
 * Requires: `npx supabase login`
 * Reads key from (first hit):
 *   - ~/Coding/SmarterSubs/.env — VITE_OPENAI_API_KEY or OPENAI_API_KEY
 *   - ../Pūrākau/.env — same keys (fallback)
 *
 * Usage (from pānui repo root):
 *   npm run secrets:openai:from-smartersubs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SMARTER_SUBS_ENV = path.join(
  process.env.HOME || process.env.USERPROFILE || '',
  'Coding',
  'SmarterSubs',
  '.env',
)
const PURAKAU_ENV = path.join(ROOT, '..', 'Pūrākau', '.env')

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

const ss = parseEnvFile(SMARTER_SUBS_ENV)
const pk = parseEnvFile(PURAKAU_ENV)

const key = (
  ss.VITE_OPENAI_API_KEY ||
  ss.OPENAI_API_KEY ||
  pk.VITE_OPENAI_API_KEY ||
  pk.OPENAI_API_KEY ||
  ''
).trim()

if (!key) {
  console.error(
    `Missing OpenAI API key. Set VITE_OPENAI_API_KEY or OPENAI_API_KEY in one of:\n  ${SMARTER_SUBS_ENV}\n  ${PURAKAU_ENV}`,
  )
  process.exit(1)
}

const local = parseEnvFile(path.join(ROOT, '.env'))
const ref =
  projectRefFromUrl(local.VITE_SUPABASE_URL) ||
  projectRefFromUrl(
    (parseEnvFile(path.join(ROOT, '.env.example')).VITE_SUPABASE_URL || '').trim(),
  )
if (!ref) {
  console.error(
    'Could not parse Supabase project ref from pānui .env VITE_SUPABASE_URL (or .env.example).',
  )
  process.exit(1)
}

function setSecret(name, value) {
  const r = spawnSync(
    'npx',
    ['--yes', 'supabase', 'secrets', 'set', `${name}=${value}`, '--project-ref', ref],
    { cwd: ROOT, stdio: 'inherit', env: { ...process.env } },
  )
  return r.status ?? 1
}

console.log(`Setting OPENAI_API_KEY on Supabase project ${ref} (value not shown)`)
if (setSecret('OPENAI_API_KEY', key) !== 0) {
  console.error('\nFailed. Try: npx supabase login')
  process.exit(1)
}

const suggestModel = (
  ss.VITE_OPENAI_SUGGEST_MODEL ||
  ss.OPENAI_SUGGEST_MODEL ||
  pk.VITE_OPENAI_SUGGEST_MODEL ||
  pk.OPENAI_SUGGEST_MODEL ||
  ''
).trim()
if (suggestModel) {
  console.log('Setting OPENAI_SUGGEST_MODEL')
  setSecret('OPENAI_SUGGEST_MODEL', suggestModel)
}

const matchModel = (
  ss.VITE_OPENAI_MATCH_MODEL ||
  ss.OPENAI_MATCH_MODEL ||
  pk.VITE_OPENAI_MATCH_MODEL ||
  pk.OPENAI_MATCH_MODEL ||
  suggestModel ||
  ''
).trim()
if (matchModel) {
  console.log('Setting OPENAI_MATCH_MODEL')
  setSecret('OPENAI_MATCH_MODEL', matchModel)
}

console.log('\nDone. Deploy matcher if needed: npm run functions:deploy:match-te-aka-sense')
