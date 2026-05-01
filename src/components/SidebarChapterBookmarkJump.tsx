import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaBookmark, FaRegBookmark } from 'react-icons/fa'
import type { ChapterBookmark } from '../lib/chapterBookmark'
import { readStaticChapterBookmark, readSupabaseChapterBookmark } from '../lib/chapterBookmark'

type StaticProps = {
  kind: 'static'
  bookId: string
  chapterId: string
}

type SupabaseProps = {
  kind: 'supabase'
  titleId: number
  versionId: number
  chapterNumber: number
}

type Props = StaticProps | SupabaseProps

function bookmarkHref(props: Props, bm: ChapterBookmark): string {
  if (props.kind === 'static') {
    const { bookId, chapterId } = props
    return `/read/${bookId}/${chapterId}/${bm.batchIndex}#panui-chunk-${bm.chunkIndex}`
  }
  const tid = String(props.titleId)
  const vid = String(props.versionId)
  return `/read/title/${tid}/version/${vid}/${bm.batchIndex}#panui-chunk-${bm.chunkIndex}`
}

function readBookmark(props: Props): ChapterBookmark | null {
  if (props.kind === 'static') {
    return readStaticChapterBookmark(props.bookId, props.chapterId)
  }
  return readSupabaseChapterBookmark(props.titleId, props.versionId, props.chapterNumber)
}

function scopeKey(props: Props): string {
  if (props.kind === 'static') {
    return `s:${props.bookId}:${props.chapterId}`
  }
  return `db:${props.titleId}:${props.versionId}:${props.chapterNumber}`
}

/** One saved spot per chapter: jump to batch + paragraph (replaces legacy Clear). */
export function SidebarChapterBookmarkJump(props: Props) {
  const key = scopeKey(props)
  const propsRef = useRef(props)
  propsRef.current = props
  const [bm, setBm] = useState<ChapterBookmark | null>(() => readBookmark(props))

  useEffect(() => {
    const sync = () => setBm(readBookmark(propsRef.current))
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('panui-chapter-bookmark-changed', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('panui-chapter-bookmark-changed', sync)
    }
  }, [key])

  if (!bm) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-md p-2 text-gray-300"
        title="No paragraph bookmark in this chapter yet — set one in split view (bookmark column)"
        role="img"
        aria-label="No paragraph bookmark saved for this chapter"
      >
        <FaRegBookmark className="h-4 w-4" aria-hidden />
      </span>
    )
  }

  return (
    <Link
      to={bookmarkHref(props, bm)}
      className="inline-flex shrink-0 items-center justify-center rounded-md p-2 text-amber-700 hover:bg-amber-50"
      title="Jump to bookmarked paragraph in this chapter"
      aria-label="Jump to bookmarked paragraph in this chapter"
    >
      <FaBookmark className="h-4 w-4" aria-hidden />
    </Link>
  )
}
