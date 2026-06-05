import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'

/**
 * Server-side Supabase client.
 *
 * Reads use the anon key (RLS allows anon read on the tables Trove exposes),
 * matching the frontend's current access. If/when we add write or admin
 * endpoints, prefer a separate service-role client created on demand rather
 * than widening this one — keeps read paths from accidentally bypassing RLS.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})
