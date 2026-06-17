import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/context.js'

/**
 * Tiny in-memory fixed-window rate limiter.
 *
 * Keyed by the authenticated user id (these routes all run after requireAuth),
 * which is a better identity than IP behind a shared proxy. State lives in this
 * process only: good enough for the single always-on worker/API instance — if
 * the API is ever scaled horizontally, move this to a shared store (e.g. a
 * Postgres/Redis counter). It's a courtesy throttle to stop a logged-in user
 * from hammering the expensive endpoints (outbound Reddit/IG calls, sync
 * enqueue + GitHub dispatch), not a defense against a determined attacker.
 *
 * Returns 429 with a Retry-After header when the window's budget is spent.
 */
type Bucket = { count: number; resetAt: number }

export function rateLimit(opts: { limit: number; windowMs: number; name?: string }) {
  const buckets = new Map<string, Bucket>()

  // Opportunistic sweep of expired buckets so the map can't grow unbounded.
  function sweep(now: number) {
    if (buckets.size < 1000) return
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
  }

  return createMiddleware<AppEnv>(async (c, next) => {
    const now = Date.now()
    sweep(now)
    // requireAuth runs first, so userId is set; fall back to IP/global defensively.
    const id = c.get('userId')
      ?? c.req.header('x-forwarded-for')
      ?? 'anonymous'
    const key = `${opts.name ?? 'rl'}:${id}`

    let b = buckets.get(key)
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + opts.windowMs }
      buckets.set(key, b)
    }
    b.count++

    if (b.count > opts.limit) {
      const retryAfter = Math.ceil((b.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      return c.json({ error: 'Too many requests — slow down.', retryAfter }, 429)
    }
    await next()
  })
}
