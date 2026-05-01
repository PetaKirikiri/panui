import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/authContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirectTo = params.get('redirect') || '/'

  const { signInWithPassword, signUpWithPassword, loading: authLoading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { error: err } = await signUpWithPassword(email.trim(), password)
        if (err) {
          setError(err.message)
          return
        }
        setMessage(
          'Account created. If email confirmation is enabled in Supabase, check your inbox; then sign in.',
        )
        setMode('signin')
        return
      }
      const { error: err } = await signInWithPassword(email.trim(), password)
      if (err) {
        setError(err.message)
        return
      }
      navigate(redirectTo, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md p-8">
      <h1 className="text-xl font-semibold text-gray-900">
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        Uses Supabase Auth with your project&apos;s{' '}
        <code className="rounded bg-gray-100 px-1">VITE_SUPABASE_*</code> settings.
      </p>

      <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-green-700">{message}</p> : null}

        <button
          type="submit"
          disabled={busy || authLoading}
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>

      <p className="mt-4 text-sm text-gray-600">
        {mode === 'signin' ? (
          <>
            Need an account?{' '}
            <button
              type="button"
              className="font-medium text-blue-600 underline"
              onClick={() => {
                setMode('signup')
                setError(null)
                setMessage(null)
              }}
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              type="button"
              className="font-medium text-blue-600 underline"
              onClick={() => {
                setMode('signin')
                setError(null)
                setMessage(null)
              }}
            >
              Sign in
            </button>
          </>
        )}
      </p>

      <p className="mt-6 text-sm">
        <Link to="/" className="text-blue-600 underline">
          ← Back to app
        </Link>
      </p>
    </div>
  )
}
