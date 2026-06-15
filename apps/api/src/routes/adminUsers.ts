import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../lib/context.js'
import { requireAdmin } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

/**
 * Admin user management (mounted /api/admin/users, admin-only).
 *   GET  /        — every account with its approval status
 *   POST /:id     — set a user's status { status: pending|approved|blocked }
 *
 * Listing users + writing user_access both need the service role (listing reads
 * auth.users; user_access writes are service-role only).
 */

const STATUSES = ['pending', 'approved', 'blocked'] as const

export const adminUsers = new Hono<AppEnv>()
  .use('*', requireAdmin)
  .get('/', async (c) => {
    const admin = supabaseAdmin()
    // auth.users (paged) joined with their user_access status.
    const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (error) return c.json({ error: error.message }, 500)
    const { data: rows } = await admin.from('user_access').select('user_id, status, approved_at')
    const byId = new Map((rows ?? []).map((r) => [r.user_id as string, r]))
    const users = list.users.map((u) => {
      const a = byId.get(u.id)
      return {
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        status: (a?.status as string) ?? 'pending',
        approved_at: (a?.approved_at as string | null) ?? null,
      }
    })
    // Pending first, then by sign-up time.
    users.sort((x, y) =>
      (x.status === 'pending' ? 0 : 1) - (y.status === 'pending' ? 0 : 1) ||
      (y.created_at ?? '').localeCompare(x.created_at ?? ''))
    return c.json({ users })
  })
  .post('/:id', zValidator('json', z.object({ status: z.enum(STATUSES) })), async (c) => {
    const userId = c.req.param('id')
    const { status } = c.req.valid('json')
    const admin = supabaseAdmin()
    // Pull the email so the row is self-describing even before the signup trigger.
    const { data: u } = await admin.auth.admin.getUserById(userId)
    const now = new Date().toISOString()
    const { error } = await admin.from('user_access').upsert(
      {
        user_id: userId,
        email: u?.user?.email ?? null,
        status,
        approved_at: status === 'approved' ? now : null,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    )
    if (error) return c.json({ error: error.message }, 500)
    return c.json({ ok: true, status })
  })
