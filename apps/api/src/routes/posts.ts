import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../lib/context.js'
import type { CategoryPost, Platform } from '@trove/shared'

const POST_COLS = 'post_id, platform, url, title, caption, owner, owner_fullname, media_type, timestamp'

const querySchema = z.object({
  category: z.string().min(1),
  platform: z.enum(['reddit', 'instagram']).optional(),
})

/**
 * GET /?category=&platform= — posts CLASSIFIED into a category (joined from
 * post_categories) that have produced NO extracted highlight in ANY category.
 * Powers the "Saved posts without extracted highlights" cards.
 *
 * A post that has a highlight somewhere (e.g. after being reclassified into
 * another category) is "processed" and is excluded here, so it leaves the backlog.
 */
export const posts = new Hono<AppEnv>().get('/', zValidator('query', querySchema), async (c) => {
  const { category, platform } = c.req.valid('query')
  const supabase = c.get('supabase')

  const base = supabase
    .from('post_categories')
    .select(`post_id, platform, posts(${POST_COLS})`)
    .eq('category_name', category)

  const filtered = platform ? base.eq('platform', platform) : base
  const { data, error } = await filtered

  if (error) {
    return c.json({ error: error.message }, 500)
  }

  const seen = new Set<string>()
  const candidates: CategoryPost[] = []
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const p = row.posts as Record<string, unknown> | null
    if (!p || seen.has(p.post_id as string)) continue
    seen.add(p.post_id as string)
    candidates.push({
      post_id: p.post_id as string,
      platform: p.platform as Platform,
      url: (p.url as string | null) ?? null,
      title: (p.title as string | null) ?? null,
      caption: (p.caption as string | null) ?? null,
      owner: (p.owner as string | null) ?? null,
      owner_fullname: (p.owner_fullname as string | null) ?? null,
      media_type: (p.media_type as string | null) ?? null,
      timestamp: (p.timestamp as string | null) ?? null,
    })
  }

  // Drop any candidate that already has an extracted highlight (in any category).
  // Checked only against this category's posts, chunked to keep the `in(...)` small.
  const ids = candidates.map((p) => p.post_id)
  const withItems = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data: items, error: itemsErr } = await supabase
      .from('analysis_items')
      .select('source_post_id')
      .in('source_post_id', ids.slice(i, i + 200))
    if (itemsErr) return c.json({ error: itemsErr.message }, 500)
    for (const it of (items ?? []) as { source_post_id: string | null }[]) {
      if (it.source_post_id) withItems.add(it.source_post_id)
    }
  }

  return c.json(candidates.filter((p) => !withItems.has(p.post_id)))
})
