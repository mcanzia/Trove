import { Hono } from 'hono'
import type { AppEnv } from '../lib/context.js'

/**
 * The caller's own approval status (for the web to show a pending/blocked state
 * instead of the sync UI). Reads under the user's JWT — RLS allows own-read.
 * Returns 'pending' when no row exists yet (e.g. a signup that predates the
 * trigger).
 */
export const access = new Hono<AppEnv>().get('/', async (c) => {
  const { data, error } = await c.get('supabase')
    .from('user_access')
    .select('status')
    .eq('user_id', c.get('userId'))
    .maybeSingle()
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ status: (data?.status as string) ?? 'pending' })
})
