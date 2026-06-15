import { Hono } from 'hono'
import type { AppEnv } from '../lib/context.js'
import { env } from '../lib/env.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { encryptToken } from '../lib/crypto.js'

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/**
 * Authed connection routes (mounted at /api/connections, under requireAuth):
 *   GET    /                  — caller's connection state (no secrets)
 *   POST   /reddit/credential — store the user's pasted Reddit cookie (verified)
 *   DELETE /reddit            — disconnect (wipe credential + connection)
 *
 * No platform OAuth app: the user pastes their own browser cookie (the same
 * mechanism the single-tenant pipeline uses), so this sidesteps Reddit's app
 * approval gate. The cookie is AES-GCM encrypted at rest and only the worker's
 * service role can read it; it never goes back to the client.
 */

/** Verify a Reddit cookie by fetching one saved item; returns true if it works. */
async function verifyRedditCookie(cookie: string, username: string): Promise<boolean> {
  const url = `https://www.reddit.com/user/${encodeURIComponent(username)}/saved.json?limit=1&raw_json=1`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', Cookie: cookie },
    })
    if (!res.ok) return false
    const body = (await res.json()) as { data?: { children?: unknown[] } }
    return !!body?.data
  } catch {
    return false
  }
}

export const connections = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { data, error } = await c.get('supabase')
      .from('connections')
      .select('platform, status, reddit_username, scopes, connected_at, last_synced_at')
    if (error) return c.json({ error: error.message }, 500)
    return c.json({ connections: data ?? [] })
  })
  .post('/reddit/credential', async (c) => {
    if (!env.REDDIT_TOKEN_ENC_KEY) {
      return c.json({ error: 'Reddit connect is not configured on the server' }, 503)
    }
    const body = (await c.req.json().catch(() => ({}))) as { cookie?: string; username?: string }
    const cookie = (body.cookie ?? '').trim()
    const username = (body.username ?? '').trim().replace(/^\/?u\//i, '')
    if (!cookie || !username) {
      return c.json({ error: 'Both your Reddit cookie and username are required.' }, 400)
    }

    if (!(await verifyRedditCookie(cookie, username))) {
      return c.json(
        { error: "Couldn't read your saved posts with that cookie. Double-check the username and that the cookie is fresh (copied while logged in)." },
        400,
      )
    }

    const userId = c.get('userId')
    const now = new Date().toISOString()
    const admin = supabaseAdmin()
    const conn = await admin.from('connections').upsert(
      { user_id: userId, platform: 'reddit', status: 'connected', reddit_username: username, scopes: 'cookie', connected_at: now, updated_at: now },
      { onConflict: 'user_id,platform' },
    )
    if (conn.error) return c.json({ error: conn.error.message }, 500)
    const sec = await admin.from('connection_secrets').upsert(
      { user_id: userId, platform: 'reddit', refresh_token_enc: encryptToken(cookie), updated_at: now },
      { onConflict: 'user_id,platform' },
    )
    if (sec.error) return c.json({ error: sec.error.message }, 500)
    return c.json({ ok: true, username })
  })
  .delete('/reddit', async (c) => {
    const userId = c.get('userId')
    const admin = supabaseAdmin()
    await admin.from('connection_secrets').delete().eq('user_id', userId).eq('platform', 'reddit')
    await admin.from('connections').delete().eq('user_id', userId).eq('platform', 'reddit')
    return c.json({ ok: true })
  })
