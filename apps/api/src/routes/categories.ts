import { Hono } from 'hono'
import { supabase } from '../lib/supabase.js'
import type { Category } from '../types.js'

/**
 * GET / — all categories, ordered by name.
 *
 * Migrated from Trove's useCategories hook. output_fields / group_by are stored
 * as JSON (sometimes as a JSON string); we normalize them server-side so the
 * client receives ready-to-use values.
 */
export const categories = new Hono().get('/', async (c) => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name')

  if (error) {
    return c.json({ error: error.message }, 500)
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  const result: Category[] = rows.map((raw) => ({
    ...(raw as unknown as Category),
    output_fields:
      typeof raw.output_fields === 'string'
        ? JSON.parse(raw.output_fields)
        : (raw.output_fields as Category['output_fields']),
    group_by:
      typeof raw.group_by === 'string'
        ? JSON.parse(raw.group_by)
        : (raw.group_by as Category['group_by']),
  }))

  return c.json(result)
})
