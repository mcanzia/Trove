import { createMiddleware } from 'hono/factory'
import { supabase, userClient } from '../lib/supabase.js'
import type { AppEnv } from '../lib/context.js'

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
  c.set('supabase', userClient(token))
  await next()
})
