import { Hono } from 'hono'
import type { AppEnv } from '../lib/context.js'

const JOB_COLS = 'id, platform, status, phase, counts, error, created_at, started_at, finished_at'

function platformOf(v: unknown): 'reddit' | 'instagram' {
  return v === 'instagram' ? 'instagram' : 'reddit'
}

/**
 * Sync jobs (mounted at /api/sync-jobs, under requireAuth). Reads/writes run
 * under the user's JWT, so RLS scopes everything to them. The worker (service
 * role) updates job progress out-of-band.
 *
 *   POST /                  — enqueue a sync for { platform } (or return the in-flight one)
 *   GET  /latest?platform=  — the caller's most recent job for a platform (polling fallback)
 */
export const syncJobs = new Hono<AppEnv>()
  .post('/', async (c) => {
    const supabase = c.get('supabase')
    const userId = c.get('userId')
    const body = (await c.req.json().catch(() => ({}))) as { platform?: string }
    const platform = platformOf(body.platform)

    // Don't stack duplicate syncs for the same platform — return the in-flight one.
    const { data: active } = await supabase
      .from('sync_jobs')
      .select(JOB_COLS)
      .eq('platform', platform)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
    if (active && active.length) return c.json(active[0])

    const { data, error } = await supabase
      .from('sync_jobs')
      .insert({ user_id: userId, platform, status: 'pending' })
      .select(JOB_COLS)
      .single()
    if (error) return c.json({ error: error.message }, 500)
    return c.json(data)
  })
  .get('/latest', async (c) => {
    const platform = platformOf(c.req.query('platform'))
    const { data, error } = await c.get('supabase')
      .from('sync_jobs')
      .select(JOB_COLS)
      .eq('platform', platform)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return c.json({ error: error.message }, 500)
    return c.json(data?.[0] ?? null)
  })
