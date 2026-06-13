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
 * GET /?category=&platform= — every post CLASSIFIED into a category (joined from
 * post_categories), regardless of whether it produced an extracted item. Powers
 * the "surface every saved post" link-out cards so nothing saved is hidden.
 */
export const posts = new Hono<AppEnv>().get('/', zValidator('query', querySchema), async (c) => {
  const { category, platform } = c.req.valid('query')

  const base = c.get('supabase')
    .from('post_categories')
    .select(`post_id, platform, posts(${POST_COLS})`)
    .eq('category_name', category)

  const filtered = platform ? base.eq('platform', platform) : base
  const { data, error } = await filtered

  if (error) {
    return c.json({ error: error.message }, 500)
  }

  const seen = new Set<string>()
  const result: CategoryPost[] = []
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const p = row.posts as Record<string, unknown> | null
    if (!p || seen.has(p.post_id as string)) continue
    seen.add(p.post_id as string)
    result.push({
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

  return c.json(result)
})
