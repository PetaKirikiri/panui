import { createClient } from '@supabase/supabase-js'

const EXAMPLE_SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co'

const rawUrl = import.meta.env.VITE_SUPABASE_URL
if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
  throw new Error(
    `Missing VITE_SUPABASE_URL. Copy .env.example to .env and set your Supabase URL (e.g. ${EXAMPLE_SUPABASE_URL}).`,
  )
}
const publicSupabaseUrl = rawUrl.trim()

/**
 * Opt-in: set VITE_SUPABASE_USE_DEV_PROXY=1 so API calls go to same-origin /__supabase (Vite proxies).
 * Default OFF — the proxy uses Node networking; if Node cannot reach Supabase (TLS/firewall), you get 502/500.
 * Use a normal browser with direct *.supabase.co access when possible.
 */
const useDevProxy =
  import.meta.env.DEV &&
  import.meta.env.VITEST !== 'true' &&
  (import.meta.env.VITE_SUPABASE_USE_DEV_PROXY === '1' ||
    import.meta.env.VITE_SUPABASE_USE_DEV_PROXY === 'true')

/** In dev, same-origin URL so embedded browsers / strict CSP can reach Supabase via Vite `/__supabase` proxy. */
function resolveSupabaseUrl(): string {
  if (
    useDevProxy &&
    typeof window !== 'undefined' &&
    typeof window.location?.origin === 'string'
  ) {
    return `${window.location.origin}/__supabase`
  }
  return publicSupabaseUrl
}

const supabaseUrl = resolveSupabaseUrl()

const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseAnonKey = typeof rawKey === 'string' && rawKey.trim().length > 0 ? rawKey.trim() : undefined

if (!supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_ANON_KEY. For Vercel: Project → Settings → Environment Variables, add VITE_SUPABASE_ANON_KEY (your Supabase anon/public key from Project Settings → API), then redeploy so the build picks it up.',
  )
}

if (supabaseAnonKey.toLowerCase() === 'your-anon-key') {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY is still the .env.example placeholder. In Supabase: Project Settings → API → Project API keys → anon public.',
  )
}

/** HTTPS project base (no path) — for diagnostics; not the dev proxy URL. */
export function getPublicSupabaseOrigin(): string {
  return publicSupabaseUrl.replace(/\/$/, '')
}

let parsedSupabaseUrl: URL
try {
  parsedSupabaseUrl = new URL(supabaseUrl)
} catch {
  throw new Error(`VITE_SUPABASE_URL is not a valid URL. Example: ${EXAMPLE_SUPABASE_URL}`)
}
const isLocalSupabase =
  parsedSupabaseUrl.protocol === 'http:' &&
  (parsedSupabaseUrl.hostname === 'localhost' || parsedSupabaseUrl.hostname === '127.0.0.1')
if (parsedSupabaseUrl.protocol !== 'https:' && !isLocalSupabase) {
  throw new Error(
    `VITE_SUPABASE_URL must be https (or http://localhost for local Supabase). Example: ${EXAMPLE_SUPABASE_URL}`,
  )
}

/** Same base URL as the JS client (includes dev `/__supabase` proxy when enabled). */
export function getSupabaseRestBaseUrl(): string {
  return resolveSupabaseUrl()
}

/**
 * Vite proxy can occasionally return an empty body; supabase-js then throws on `response.json()`.
 * Normalize empty bodies so callers always get parseable JSON (or a clear auth-shaped error).
 */
const devProxyFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init)
  const text = await res.text()
  if (text.trim().length > 0) {
    return new Response(text, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  }
  if (res.status === 204 || res.status === 205) {
    return new Response(null, { status: res.status, statusText: res.statusText, headers: res.headers })
  }
  const desc = `HTTP ${res.status} with empty body. If using the dev proxy (VITE_SUPABASE_USE_DEV_PROXY=1), check the Vite terminal and that Node can reach ${getPublicSupabaseOrigin()}; otherwise use direct Supabase (unset that var) and confirm VITE_SUPABASE_URL.`
  const payload = JSON.stringify({
    error: 'empty_response',
    error_description: desc,
  })
  const outStatus = res.ok ? 502 : res.status
  return new Response(payload, {
    status: outStatus,
    statusText: res.statusText,
    headers: res.headers,
  })
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  useDevProxy ? { global: { fetch: devProxyFetch } } : undefined,
)
