import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env.js'

/**
 * Service-role Supabase client for privileged writes.
 *
 * The service-role key bypasses RLS, so all mutating endpoints go through here
 * (the anon client in supabase.ts stays read-only). Created lazily so the API
 * still boots for read-only use when SUPABASE_SERVICE_ROLE_KEY isn't set;
 * write endpoints then fail with a clear, catchable error.
 *
 * SECURITY: never expose this client or the service-role key to the browser.
 */
let admin: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured — write endpoints are disabled',
    )
  }
  if (!admin) {
    admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  }
  return admin
}
