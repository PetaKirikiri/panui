import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import ImportChapterPage from './pages/ImportChapterPage'
import LoginPage from './pages/LoginPage'
import StaticReaderPage from './pages/StaticReaderPage'
import SupabaseReaderPage from './pages/SupabaseReaderPage'
import { getDefaultReaderPath } from './content/registry'

function IndexRedirect() {
  const path = getDefaultReaderPath()
  if (!path) {
    return (
      <div className="p-8 text-gray-600">
        <p>No chapters configured. Add JSON under <code className="rounded bg-gray-100 px-1">content/</code> and register in{' '}
        <code className="rounded bg-gray-100 px-1">registry.ts</code>.</p>
      </div>
    )
  }
  return <Navigate to={path} replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<IndexRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/import" element={<ImportChapterPage />} />
        <Route
          path="/read/title/:titleId/version/:versionId/:batchIndex"
          element={<SupabaseReaderPage />}
        />
        <Route path="/read/:bookId/:chapterId/:batchIndex" element={<StaticReaderPage />} />
      </Route>
    </Routes>
  )
}
