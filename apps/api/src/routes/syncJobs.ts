import { Hono } from 'hono'
import type { AppEnv } from '../lib/context.js'

const JOB_COLS = 'id, status, phase, counts, error, created_at, started_at, finished_at'

/**
 * Sync jobs (mounted at /api/sync-jobs, under requireAuth). Reads/writes run
 * under the user's JWT, so RLS scopes everything to them. The worker (service
 * role) updates job progress out-of-band.
 *
 *   POST /         — enqueue a Reddit sync (or return the in-flight one)
 *   GET  /latest   — the caller's most recent job (polling fallback for progress)
 */
export const syncJobs = new Hono<AppEnv>()
  .post('/', async (c) => {
    const supabase = c.get('supabase')
    const userId = c.get('userId')

    // Don't stack duplicate syncs — return any pending/running job instead.
    const { data: active } = await supabase
      .from('sync_jobs')
      .select(JOB_COLS)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
    if (active && active.length) return c.json(active[0])

    const { data, error } = await supabase
      .from('sync_jobs')
      .insert({ user_id: userId, platform: 'reddit', status: 'pending' })
      .select(JOB_COLS)
      .single()
    if (error) return c.json({ error: error.message }, 500)
    return c.json(data)
  })
  .get('/latest', async (c) => {
    const { data, error } = await c.get('supabase')
      .from('sync_jobs')
      .select(JOB_COLS)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return c.json({ error: error.message }, 500)
    return c.json(data?.[0] ?? null)
  })
