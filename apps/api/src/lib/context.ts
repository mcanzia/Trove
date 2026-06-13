import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Per-request context set by the auth middleware (see middleware/auth.ts).
 *
 * - `supabase`: a Supabase client bound to the requesting user's JWT, so every
 *   query runs under that user's RLS identity (auth.uid()). Routes use this for
 *   BOTH reads and writes — RLS scopes rows to the owner automatically.
 * - `userId`: the authenticated user's id (handy for stamping user_id on writes).
 */
export type Variables = {
  supabase: SupabaseClient
  userId: string
}

export type AppEnv = { Variables: Variables }
