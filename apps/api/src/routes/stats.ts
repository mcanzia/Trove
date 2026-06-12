import { Hono } from 'hono'
import { supabase } from '../lib/supabase.js'

/**
 * GET / — per-category item counts plus an overall total.
 *
 * Pulls every analysis_items.category_name (≈1.5k tiny rows) and aggregates the
 * counts server-side, returning { total, perCategory }. Cached for 5 minutes;
 * the web client (useStats) mirrors that with a 5-minute staleTime.
 */
export const stats = new Hono().get('/', async (c) => {
  // PostgREST caps responses at 1000 rows, so page through with .range().
  const PAGE = 1000
  const rows: { category_name: string | null }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('analysis_items')
      .select('category_name')
      .range(from, from + PAGE - 1)

    if (error) {
      return c.json({ error: error.message }, 500)
    }
    const page = (data ?? []) as { category_name: string | null }[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  const perCategory: Record<string, number> = {}
  for (const row of rows) {
    const name = row.category_name
    if (!name) continue
    perCategory[name] = (perCategory[name] ?? 0) + 1
  }

  c.header('Cache-Control', 'max-age=300')
  return c.json({ total: rows.length, perCategory })
})
