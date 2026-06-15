/**
 * Client-side admin check — UX only (hide the /admin link + redirect non-admins).
 * The real enforcement is the API's requireAdmin + Supabase RLS; this just avoids
 * showing a page that would 403 anyway. Configurable via VITE_ADMIN_EMAILS
 * (comma-separated); defaults to the owner so it works without extra config.
 */
const ADMIN_EMAILS = (
  (import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? 'canziani.developer@gmail.com'
)
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isAdmin(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase())
}
