import type { QueryClient } from '@tanstack/react-query'
import { clearStaticChapterLocalStorage } from '../content/lastBatch'
import { wipeChapterSentencesWithClient } from './importChapterCore'
import { supabase } from './supabase'

/** Clears local drafts + saved batch index; dispatches so StaticReaderPage remounts the editor. */
export function clearStaticChapterContents(bookId: string, chapterId: string): void {
  clearStaticChapterLocalStorage(bookId, chapterId)
  window.dispatchEvent(
    new CustomEvent('panui-static-chapter-cleared', {
      detail: { bookId, chapterId },
    }),
  )
}

/** Wipes DB sentences for one chapter, clears draft keys for this title/version, refreshes cache; dispatches so SupabaseReaderPage remounts. */
export async function clearSupabaseChapterContents(
  queryClient: QueryClient,
  args: { titleId: number; versionId: number; chapterNumber: number },
): Promise<void> {
  await wipeChapterSentencesWithClient(supabase, args)
  const prefix = `panui:supabase-draft:${args.titleId}:${args.versionId}:`
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefix)) localStorage.removeItem(k)
    }
  } catch {
    /* ignore */
  }
  await queryClient.invalidateQueries({
    queryKey: ['storyReader', args.titleId, args.versionId],
  })
  window.dispatchEvent(
    new CustomEvent('panui-chapter-contents-cleared', {
      detail: {
        titleId: args.titleId,
        versionId: args.versionId,
        chapterNumber: args.chapterNumber,
      },
    }),
  )
}
