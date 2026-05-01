/** Normalises Supabase PostgREST / Postgres errors for UI and logs */
export function formatSupabaseError(err: unknown): string {
  if (err == null) return 'Unknown error'
  if (typeof err === 'string') return err

  const e = err as Record<string, unknown>
  const msg =
    typeof e.message === 'string'
      ? e.message
      : err instanceof Error
        ? err.message
        : JSON.stringify(err)

  const parts = [msg]
  if (typeof e.code === 'string' && e.code.length > 0) {
    parts.push(`Code: ${e.code}`)
  }
  if (typeof e.details === 'string' && e.details.length > 0) {
    parts.push(`Details: ${e.details}`)
  }
  if (typeof e.hint === 'string' && e.hint.length > 0) {
    parts.push(`Hint: ${e.hint}`)
  }

  const joined = parts.join('\n')

  if (/row-level security|\bRLS\b|policy|42501/i.test(joined)) {
    return `${joined}

Browser import uses your anon key. Writes require Supabase RLS policies that allow INSERT/UPDATE/DELETE on story_sources and story_sentences for your role, or use the service-role CLI (local only): npm run import:chapter — see scripts/import-chapter.ts. Never expose the service role key in the client.`
  }

  return joined
}
