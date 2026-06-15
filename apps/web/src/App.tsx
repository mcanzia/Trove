import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AppShell } from '@/components/shell/AppShell'
import { useAuth } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'
import HomePage from '@/pages/HomePage'
import CategoryPage from '@/pages/CategoryPage'
import RecipePage from '@/pages/RecipePage'
import AdminPage from '@/pages/AdminPage'
import MalCallback from '@/pages/MalCallback'
import Login from '@/pages/Login'
import AuthCallback from '@/pages/AuthCallback'

/** Gate for the authenticated app — redirects to /login when there's no session. */
function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

/** Gate for the admin dashboard — non-admins are bounced home (API + RLS enforce
 *  the real lock; this just hides a page that would 403 anyway). */
function RequireAdmin() {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  if (!isAdmin(session.user?.email)) return <Navigate to="/" replace />
  return <Outlet />
}

export default function App() {
  const { session, loading } = useAuth()
  return (
    <Routes>
      {/* Once authenticated, /login bounces home — covers password sign-in, which
          (unlike magic link) doesn't route through /auth/callback. */}
      <Route
        path="/login"
        element={!loading && session ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Everything below requires a session. */}
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="/category/:slug" element={<CategoryPage />} />
          <Route path="/category/:slug/recipe/:postId" element={<RecipePage />} />
        </Route>
        <Route path="/mal-callback" element={<MalCallback />} />
      </Route>
    </Routes>
  )
}
