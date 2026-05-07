import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/authContext'
import { ReaderViewModeProvider } from '../context/ReaderViewModeProvider'
import { useReaderViewMode } from '../hooks/useReaderViewMode'
import { AppSidebar } from './AppSidebar'
import { EcosystemAppSwitcher } from './EcosystemAppSwitcher'

function ReaderViewToolbar() {
  const location = useLocation()
  const show =
    location.pathname.startsWith('/read/title/') ||
    /^\/read\/[^/]+\/[^/]+\/\d+$/.test(location.pathname)
  const { mode, setMode } = useReaderViewMode()

  if (!show) return null

  const btn =
    'rounded px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
  const inactive = 'text-gray-600 hover:bg-gray-100'
  const active = 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'

  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5"
      role="group"
      aria-label="Reading layout"
    >
      <button
        type="button"
        className={`${btn} ${mode === 'mi' ? active : inactive}`}
        aria-pressed={mode === 'mi'}
        onClick={() => setMode('mi')}
      >
        Māori only
      </button>
      <button
        type="button"
        className={`${btn} ${mode === 'en' ? active : inactive}`}
        aria-pressed={mode === 'en'}
        onClick={() => setMode('en')}
      >
        English only
      </button>
      <button
        type="button"
        className={`${btn} ${mode === 'split' ? active : inactive}`}
        aria-pressed={mode === 'split'}
        onClick={() => setMode('split')}
      >
        Split
      </button>
    </div>
  )
}

export function AppShell() {
  const location = useLocation()
  const { user, loading: authLoading, signOut } = useAuth()

  return (
    <ReaderViewModeProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-white">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-200 px-3 py-3">
          <EcosystemAppSwitcher />
          <span className="hidden text-sm text-gray-500 sm:inline">
            Assistive bilingual reader
          </span>
          <span className="flex-1" />
          <ReaderViewToolbar />
          {authLoading ? null : user ? (
            <>
              <span
                className="hidden max-w-[14rem] truncate text-sm text-gray-600 sm:inline"
                title={user.email ?? undefined}
              >
                {user.email}
              </span>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to={`/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`}
              className="text-sm font-medium text-blue-600 underline"
            >
              Log in
            </Link>
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          <AppSidebar />
          <main id="panui-main" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </ReaderViewModeProvider>
  )
}
