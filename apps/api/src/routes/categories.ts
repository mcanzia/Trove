import { Hono } from 'hono'
import type { AppEnv } from '../lib/context.js'
import type { Category } from '../types.js'

/**
 * GET / — all categories, ordered by name.
 *
 * Migrated from Trove's useCategories hook. output_fields / group_by are stored
 * as JSON (sometimes as a JSON string); we normalize them server-side so the
 * client receives ready-to-use values. `categories` is global reference data,
 * readable by any authenticated user (no per-user scoping).
 */
export const categories = new Hono<AppEnv>().get('/', async (c) => {
  const { data, error } = await c.get('supabase')
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
