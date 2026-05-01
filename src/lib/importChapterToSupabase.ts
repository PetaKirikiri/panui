import { supabase } from './supabase'
import type { ImportChapterArgs } from './importChapterCore'
import { importChapterWithClient } from './importChapterCore'
import { formatSupabaseError } from './formatSupabaseError'

export type { ImportChapterArgs }
export { importChapterWithClient }

export type TitleRow = { id: number; name: string }
export type VersionRow = { id: number; label: string | null; version_number: number | null }

function throwFormatted(err: unknown): never {
  throw new Error(formatSupabaseError(err))
}

export async function fetchTitlesForImport(): Promise<TitleRow[]> {
  const { data, error } = await supabase.from('titles').select('id, name').order('name')
  if (error) throwFormatted(error)
  return (data ?? []) as TitleRow[]
}

export async function fetchVersionsForTitle(titleId: number): Promise<VersionRow[]> {
  const { data, error } = await supabase
    .from('story_versions')
    .select('id, label, version_number')
    .eq('title_id', titleId)
    .order('version_number', { ascending: true })
  if (error) throwFormatted(error)
  return (data ?? []) as VersionRow[]
}

export async function importChapterToSupabase(args: ImportChapterArgs): Promise<void> {
  return importChapterWithClient(supabase, args)
}
