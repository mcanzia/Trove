import { createMiddleware } from 'hono/factory'
import { supabase, userClient } from '../lib/supabase.js'
import type { AppEnv } from '../lib/context.js'
import { env } from '../lib/env.js'

/**
 * Require a valid Supabase session on /api/* routes.
 *
 * Expects `Authorization: Bearer <access_token>` (the frontend attaches the
 * logged-in user's JWT — see apps/web/src/lib/api.ts). The token is verified
 * with GoTrue via supabase.auth.getUser(); on success we attach a per-request
 * client bound to that JWT (so every query runs under the user's RLS identity)
 * plus the user id. On any failure → 401, so no unauthenticated request ever
 * reaches a data query.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : ''

  if (!token) {
    return c.json({ error: 'Missing bearer token' }, 401)
  }

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    return c.json({ error: 'Invalid or expired session' }, 401)
  }

  c.set('userId', data.user.id)
  c.set('userEmail', data.user.email ?? null)
  c.set('supabase', userClient(token))
  await next()
})

/**
 * Restrict a route group to admin accounts (ADMIN_EMAILS, comma-separated).
 * Runs AFTER requireAuth (which sets userEmail). Returns 403 for non-admins, so
 * even a valid non-admin session can't reach admin endpoints. Fail-closed: if
 * ADMIN_EMAILS is unset, nobody is admin.
 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const email = (c.get('userEmail') ?? '').toLowerCase()
  const allowed = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (!email || !allowed.includes(email)) {
    return c.json({ error: 'Forbidden — admin only' }, 403)
  }
  await next()
})
