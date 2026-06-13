import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

/**
 * Magic-link landing route. The Supabase client auto-detects the token in the
 * URL and sets the session (firing onAuthStateChange → useAuth), so we just wait
 * for auth to settle and bounce to the app (or back to /login if it didn't take).
 */
export default function AuthCallback() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading) {
      navigate(session ? '/' : '/login', { replace: true })
    }
  }, [loading, session, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Signing you in…
    </div>
  )
}
