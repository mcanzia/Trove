import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../lib/context.js'
import type { AnalysisItem } from '../types.js'

const POST_COLUMNS = 'url, year, timestamp, caption, owner, owner_fullname, platform'

const querySchema = z.object({
  category: z.string().min(1),
  platform: z.enum(['reddit', 'instagram']).optional(),
})

/**
 * GET /?category=…&platform=… — analysis items for a category, newest first,
 * each with its joined post. item_data is normalized from JSON server-side.
 *
 * Migrated from Trove's useAnalysisItems hook.
 */
export const analysisItems = new Hono<AppEnv>().get(
  '/',
  zValidator('query', querySchema),
  async (c) => {
    const { category, platform } = c.req.valid('query')

    const base = c.get('supabase')
      .from('analysis_items')
      .select(`*, posts(${POST_COLUMNS})`)
      .eq('category_name', category)

    const filtered = platform ? base.eq('platform', platform) : base
    const { data, error } = await filtered.order('created_at', { ascending: false })

    if (error) {
      return c.json({ error: error.message }, 500)
    }

    const rows = (data ?? []) as Record<string, unknown>[]
    const items: AnalysisItem[] = rows.map((raw) => ({
      ...(raw as unknown as AnalysisItem),
      item_data:
        typeof raw.item_data === 'string'
          ? (JSON.parse(raw.item_data) as Record<string, unknown>)
          : (raw.item_data as Record<string, unknown>),
    }))

    return c.json(items)
  },
)
