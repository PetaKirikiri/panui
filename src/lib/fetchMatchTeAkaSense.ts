import type { TeAkaTooltipEntry } from './fetchTeAkaTooltip'
import { formatTeAkaTooltipDefinition } from './teAkaWordRegistry'
import type { TeAkaEntry } from './teAkaWordRegistry'

export type MatchTeAkaSenseBody = {
  miChunk: string
  enChunk: string
  lemma: string
  surfaceRaw: string
  senses: { index: number; pos: string; gloss: string }[]
}

/** Build senses array from tooltip entries (indices align with Te Aka tab order). */
export function sensesPayloadFromTooltipEntries(entries: TeAkaTooltipEntry[]): MatchTeAkaSenseBody['senses'] {
  return entries.map((raw, index) => ({
    index,
    pos: String(raw.pos ?? '').trim() || '(no POS label)',
    gloss: formatTeAkaTooltipDefinition(raw as TeAkaEntry).trim().slice(0, 600),
  }))
}

/**
 * POST `/functions/v1/match-te-aka-sense` — OpenAI chooses a sense index or null (server validates).
 */
export async function fetchMatchTeAkaSense(
  supabaseUrl: string,
  anonKey: string,
  body: MatchTeAkaSenseBody,
  signal?: AbortSignal,
): Promise<number | null> {
  if (!anonKey.trim() || body.senses.length === 0) return null
  const base = supabaseUrl.replace(/\/$/, '')
  const res = await fetch(`${base}/functions/v1/match-te-aka-sense`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify(body),
    signal,
  })
  const data = (await res.json().catch(() => ({}))) as { senseIndex?: unknown; error?: string }
  if (!res.ok) {
    if (import.meta.env?.DEV) {
      console.warn('[match-te-aka-sense]', res.status, data)
    }
    return null
  }
  const idx = data.senseIndex
  if (idx === null || idx === undefined) return null
  const n = Number(idx)
  if (!Number.isInteger(n) || n < 0 || n >= body.senses.length) return null
  return n
}
