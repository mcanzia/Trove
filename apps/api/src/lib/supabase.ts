import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'

/**
 * Anon Supabase client, used by the auth middleware ONLY to verify a bearer JWT
 * (supabase.auth.getUser). It is no longer used for data reads: after the
 * multi-tenant RLS migration anon has no row access, so every data query runs
 * under a logged-in user's identity via userClient() below.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})

/**
 * Per-request Supabase client bound to a user's access token. The JWT rides on
 * every PostgREST call, so RLS resolves auth.uid() to that user and scopes all
 * reads/writes to their own rows. Created fresh per request (cheap) — never
 * cached, since each carries a different identity.
 */
export function userClient(accessToken: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}
