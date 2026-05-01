import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SupabaseSidebarChapters } from '../components/SupabaseSidebarChapters'
import { SidebarChapterBookmarkJump } from '../components/SidebarChapterBookmarkJump'
import { listSidebarChapters } from '../content/registry'
import { readLastReaderImport } from '../lib/lastReaderImport'

type Props = {
  expanded: boolean
  onToggle: () => void
}

export function AppSidebar({ expanded, onToggle }: Props) {
  const location = useLocation()
  const chapters = listSidebarChapters()
  const [lastImport, setLastImport] = useState(() => readLastReaderImport())
  const demoTitleId = import.meta.env.VITE_READER_TITLE_ID as string | undefined
  const demoVersionId = import.meta.env.VITE_READER_VERSION_ID as string | undefined
  const supabaseHref =
    demoTitleId &&
    demoVersionId &&
    demoTitleId.trim().length > 0 &&
    demoVersionId.trim().length > 0
      ? `/read/title/${demoTitleId.trim()}/version/${demoVersionId.trim()}/0`
      : null

  const dbPrefix =
    demoTitleId && demoVersionId
      ? `/read/title/${demoTitleId.trim()}/version/${demoVersionId.trim()}/`
      : null

  useEffect(() => {
    const sync = () => setLastImport(readLastReaderImport())
    sync()
    window.addEventListener('panui-lastReaderImport', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('panui-lastReaderImport', sync)
      window.removeEventListener('storage', sync)
    }
  }, [location.pathname])

  const lastImportHref =
    lastImport != null
      ? `/read/title/${lastImport.titleId}/version/${lastImport.versionId}/0`
      : null
  const lastImportDbActive =
    lastImport != null &&
    location.pathname.startsWith(
      `/read/title/${lastImport.titleId}/version/${lastImport.versionId}/`,
    )

  function chapterActive(bookId: string, chapterId: string): boolean {
    const prefix = `/read/${bookId}/${chapterId}/`
    return location.pathname.startsWith(prefix)
  }

  const dbActive = dbPrefix ? location.pathname.startsWith(dbPrefix) : false

  return (
    <aside
      id="panui-sidebar"
      className={`relative flex shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-gray-50 transition-[width] duration-200 ease-out ${
        expanded ? 'w-64' : 'w-12'
      }`}
    >
      <div
        className={`flex shrink-0 items-center border-b border-gray-200 bg-gray-100 ${
          expanded ? 'justify-end px-2 py-2' : 'justify-center py-2'
        }`}
      >
        <button
          type="button"
          className="rounded-md p-2 text-gray-700 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-expanded={expanded}
          aria-controls={expanded ? 'panui-sidebar-nav' : undefined}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          onClick={onToggle}
        >
          <span aria-hidden className="block text-lg leading-none">
            {expanded ? '«' : '»'}
          </span>
        </button>
      </div>

      {!expanded ? <div className="min-h-0 flex-1 bg-gray-50" aria-hidden /> : null}

      {expanded ? (
        <nav
          id="panui-sidebar-nav"
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3"
          aria-label="Story navigation"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Harry Potter
          </p>
          <p className="mb-2 text-xs text-gray-500">Book 1</p>
          <ul className="space-y-1">
            {chapters.map(({ bookId, chapterId, title, href }) => (
              <li key={`${bookId}-${chapterId}`} className="flex items-stretch gap-1">
                <Link
                  to={href}
                  className={
                    chapterActive(bookId, chapterId)
                      ? 'block min-w-0 flex-1 rounded-md bg-white px-2 py-2 text-sm font-medium text-blue-800 shadow-sm ring-1 ring-gray-200'
                      : 'block min-w-0 flex-1 rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-100'
                  }
                >
                  <span className="block truncate">{title ?? chapterId}</span>
                </Link>
                <SidebarChapterBookmarkJump
                  key={`${bookId}:${chapterId}`}
                  kind="static"
                  bookId={bookId}
                  chapterId={chapterId}
                />
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-gray-200 pt-3">
            <SupabaseSidebarChapters />
          </div>
          {lastImportHref && lastImport ? (
            <>
              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Your import
              </p>
              <Link
                to={lastImportHref}
                className={
                  lastImportDbActive
                    ? 'block rounded-md bg-white px-2 py-2 text-sm font-medium text-blue-800 shadow-sm ring-1 ring-gray-200'
                    : 'block rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-100'
                }
              >
                <span className="block truncate">
                  Chapter {lastImport.chapterNumber}
                  {lastImport.titleName ? ` · ${lastImport.titleName}` : ''}
                </span>
                <span className="block truncate text-xs text-gray-500">
                  Supabase · title {lastImport.titleId} · v{lastImport.versionId}
                </span>
              </Link>
            </>
          ) : null}
          <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Tools
          </p>
          <Link
            to="/import"
            className={
              location.pathname === '/import'
                ? 'block rounded-md bg-white px-2 py-2 text-sm font-medium text-blue-800 shadow-sm ring-1 ring-gray-200'
                : 'block rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-100'
            }
          >
            Import chapter
            <span className="block truncate text-xs text-gray-500">Paste bilingual → Supabase</span>
          </Link>
          {supabaseHref ? (
            <>
              <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Database
              </p>
              <Link
                to={supabaseHref}
                className={
                  dbActive
                    ? 'block rounded-md bg-white px-2 py-2 text-sm font-medium text-blue-800 shadow-sm ring-1 ring-gray-200'
                    : 'block rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-100'
                }
              >
                Supabase story
                <span className="block truncate text-xs text-gray-500">
                  title {demoTitleId} · v{demoVersionId}
                </span>
              </Link>
            </>
          ) : null}
        </nav>
      ) : null}
    </aside>
  )
}
