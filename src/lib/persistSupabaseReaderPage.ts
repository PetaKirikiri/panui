import { readerParagraphsToDrafts } from './bilingualPaste'
import { replaceReaderPageWithClient } from './importChapterCore'
import { supabase } from './supabase'

export async function persistSupabaseReaderBilingualPage(args: {
  titleId: number
  versionId: number
  chapterNumber: number
  pageNumber: number
  miParagraphs: string[]
  enParagraphs: string[]
}): Promise<void> {
  const { titleId, versionId, chapterNumber, pageNumber, miParagraphs, enParagraphs } = args
  await replaceReaderPageWithClient(supabase, {
    titleId,
    versionId,
    chapterNumber,
    pageNumber,
    enDrafts: readerParagraphsToDrafts(enParagraphs, chapterNumber, pageNumber),
    miDrafts: readerParagraphsToDrafts(miParagraphs, chapterNumber, pageNumber),
  })
}
