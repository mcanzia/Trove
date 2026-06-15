import { Hono } from 'hono'
import type { AppEnv } from '../lib/context.js'
import { env } from '../lib/env.js'

const JOB_COLS = 'id, platform, status, phase, counts, error, created_at, started_at, finished_at'

function platformOf(v: unknown): 'reddit' | 'instagram' {
  return v === 'instagram' ? 'instagram' : 'reddit'
}

/**
 * Wake the GitHub Actions queue-drainer immediately via repository_dispatch.
 * Fail-soft: if the token/repo isn't configured or the call errors, the worker's
 * 6h cron backstop still picks the job up — so we never block the enqueue on it.
 */
async function fireDispatch(): Promise<void> {
  if (!env.GH_DISPATCH_TOKEN || !env.GH_DISPATCH_REPO) return
  try {
    await fetch(`https://api.github.com/repos/${env.GH_DISPATCH_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'trove-api',
      },
      body: JSON.stringify({ event_type: 'sync-requested' }),
    })
  } catch {
    /* cron backstop covers it */
  }
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

    // Enqueuing a sync is gated on owner approval (RLS enforces this too).
    const { data: access } = await supabase
      .from('user_access').select('status').eq('user_id', userId).maybeSingle()
    if (access?.status !== 'approved') return c.json({ error: 'pending_approval' }, 403)

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
    await fireDispatch()
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
