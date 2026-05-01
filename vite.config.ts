import type { ServerResponse } from 'node:http'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/** Fallback only so `vite` can start before `.env` exists; set `VITE_SUPABASE_URL` in `.env`. */
const PLACEHOLDER_SUPABASE_URL = 'https://your-project-ref.supabase.co'

/** `https://ref.supabase.co` only — no path or trailing slash (http-proxy target). */
function supabaseProxyTarget(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '')
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'https:') return PLACEHOLDER_SUPABASE_URL
    return u.origin
  } catch {
    return PLACEHOLDER_SUPABASE_URL
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseTarget = supabaseProxyTarget(
    typeof env.VITE_SUPABASE_URL === 'string' && env.VITE_SUPABASE_URL.trim().length > 0
      ? env.VITE_SUPABASE_URL
      : PLACEHOLDER_SUPABASE_URL,
  )

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    server: {
      proxy: {
        '/__supabase': {
          target: supabaseTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/__supabase/, '') || '/',
          secure: true,
          ws: true,
          configure: (proxy) => {
            proxy.on('error', (err, _req, res) => {
              console.error('[vite __supabase proxy]', err.message)
              const out = res as ServerResponse
              if (out?.writeHead && !out.headersSent) {
                out.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
                out.end(
                  JSON.stringify({
                    error: 'proxy_error',
                    error_description: `Vite proxy could not reach ${supabaseTarget}: ${err.message}. Try VITE_SUPABASE_USE_DEV_PROXY=0 if your browser can reach Supabase directly, or fix network/TLS for Node.`,
                  }),
                )
              }
            })
          },
        },
        '/api/te-aka': {
          target: 'https://maoridictionary.co.nz',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/te-aka/, ''),
        },
      },
    },
  }
})
