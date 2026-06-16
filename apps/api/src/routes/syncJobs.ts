import { Hono } from 'hono'
import type { AppEnv } from '../lib/context.js'
import { env } from '../lib/env.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

const JOB_COLS = 'id, platform, kind, params, status, phase, counts, result, error, created_at, started_at, finished_at'

// Categories whose supplemental enrichment the reclassify-commit can trigger via a
// kind=enrich worker job. Keep in sync with worker/run_enrich.py's ENRICHERS.
const ENRICHABLE_CATEGORIES = new Set([
  'Food & Cooking',
  'Travel & Destinations',
  'Video Game Recommendations',
  'Movies & Film Recommendations',
  'TV Series Recommendations',
  'Anime & Manga',
  'Music Recommendations',
  'Books Worth Reading',
  'Board Games',
  'Home & Kitchen Products',
  'Skincare & Acne Treatment',
  'Fashion & Beauty',
  'Tech & Gadgets',
])

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
      .eq('kind', 'sync')
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return c.json({ error: error.message }, 500)
    return c.json(data?.[0] ?? null)
  })
  // Reclassify ONE stored post into a target category (additive). Rides the same
  // queue; the worker branches on kind='reclassify'. No credentials needed.
  .post('/reclassify', async (c) => {
    const supabase = c.get('supabase')
    const userId = c.get('userId')

    const { data: access } = await supabase
      .from('user_access').select('status').eq('user_id', userId).maybeSingle()
    if (access?.status !== 'approved') return c.json({ error: 'pending_approval' }, 403)

    const body = (await c.req.json().catch(() => ({}))) as {
      sourcePostId?: string; platform?: string; targetCategory?: string
    }
    const sourcePostId = (body.sourcePostId ?? '').trim()
    const targetCategory = (body.targetCategory ?? '').trim()
    if (!sourcePostId || !targetCategory) {
      return c.json({ error: 'sourcePostId and targetCategory are required' }, 400)
    }
    const platform = platformOf(body.platform)

    const { data, error } = await supabase
      .from('sync_jobs')
      .insert({
        user_id: userId,
        platform,
        status: 'pending',
        kind: 'reclassify',
        params: { source_post_id: sourcePostId, target_category: targetCategory, platform },
      })
      .select(JOB_COLS)
      .single()
    if (error) return c.json({ error: error.message }, 500)
    await fireDispatch()
    return c.json(data)
  })
  // Commit the candidates the user selected from a finished reclassify preview.
  // Inserts the chosen items (service role) under the job owner's user_id and links
  // the post to the target category. Idempotent-ish: a committed job is locked.
  .post('/reclassify/commit', async (c) => {
    // RLS (owner-scoped select below) already restricts this to the caller's jobs.
    const supabase = c.get('supabase')
    const body = (await c.req.json().catch(() => ({}))) as { jobId?: string; indexes?: number[] }
    const jobId = (body.jobId ?? '').trim()
    const indexes = Array.isArray(body.indexes) ? body.indexes : []
    if (!jobId) return c.json({ error: 'jobId is required' }, 400)

    // RLS scopes this to the caller's own jobs, so a user can only commit theirs.
    const { data: job } = await supabase
      .from('sync_jobs')
      .select('id, user_id, kind, status, result')
      .eq('id', jobId)
      .maybeSingle()
    if (!job) return c.json({ error: 'job not found' }, 404)
    if (job.kind !== 'reclassify') return c.json({ error: 'not a reclassify job' }, 400)
    if (job.status !== 'succeeded') return c.json({ error: 'job not finished' }, 409)

    const result = (job.result ?? {}) as {
      candidates?: Record<string, unknown>[]
      regroup?: Record<string, { id: number; group: string }>
      target_category?: string
      platform?: string
      source_post_id?: string
      committed?: boolean
    }
    if (result.committed) return c.json({ error: 'already committed' }, 409)

    const candidates = result.candidates ?? []
    const regroup = result.regroup ?? {}
    const target = result.target_category ?? ''
    const platform = platformOf(result.platform)
    const sourcePostId = result.source_post_id ?? ''
    const validIndexes = indexes.filter((i) => Number.isInteger(i) && i >= 0 && i < candidates.length)
    const chosen = validIndexes.map((i) => candidates[i])
    if (!target || !sourcePostId) return c.json({ error: 'job result missing target/post' }, 400)

    const admin = supabaseAdmin()
    if (chosen.length) {
      const rows = chosen.map((item) => ({
        category_name: target,
        platform,
        // item_data is stored as a JSON string in jsonb (matches the sync pipeline).
        item_data: JSON.stringify(item),
        source_post_id: sourcePostId,
        user_id: job.user_id,
      }))
      const { error: insErr } = await admin.from('analysis_items').insert(rows)
      if (insErr) return c.json({ error: insErr.message }, 500)

      // Nest cross-post duplicates: for each selected candidate that matched an
      // existing item from another post, tag that existing item with the same
      // _group so the two cluster together in the UI.
      const regroupTargets = validIndexes
        .map((i) => regroup[String(i)])
        .filter((r): r is { id: number; group: string } => !!r)
      for (const r of regroupTargets) {
        const { data: row } = await admin
          .from('analysis_items').select('item_data').eq('id', r.id).maybeSingle()
        if (!row) continue
        const d = (typeof row.item_data === 'string' ? JSON.parse(row.item_data) : (row.item_data ?? {})) as Record<string, unknown>
        d._group = r.group
        await admin.from('analysis_items').update({ item_data: JSON.stringify(d) }).eq('id', r.id)
      }

      // Link the post to the target category (additive). PK (post_id, category_name, platform).
      await admin.from('post_categories').upsert(
        { post_id: sourcePostId, category_name: target, platform, user_id: job.user_id },
        { onConflict: 'post_id,category_name,platform' },
      )

      // Kick off supplemental enrichment (recipe cards / geocoding) for the new
      // items if this category has any. Best-effort: a separate kind=enrich job
      // the worker drains; failure here never blocks the commit.
      if (ENRICHABLE_CATEGORIES.has(target)) {
        await admin.from('sync_jobs').insert({
          user_id: job.user_id,
          platform,
          status: 'pending',
          kind: 'enrich',
          params: { target_category: target, source_post_id: sourcePostId, platform },
        })
        await fireDispatch()
      }
    }

    // Lock the job so the same preview can't be committed twice.
    await admin.from('sync_jobs').update({ result: { ...result, committed: true } }).eq('id', jobId)
    return c.json({ added: chosen.length })
  })
  // Poll a specific job by id (used by the reclassify dialog). RLS scopes to owner.
  .get('/:id', async (c) => {
    const { data, error } = await c.get('supabase')
      .from('sync_jobs')
      .select(JOB_COLS)
      .eq('id', c.req.param('id'))
      .maybeSingle()
    if (error) return c.json({ error: error.message }, 500)
    return c.json(data ?? null)
  })
