import { Hono, type Context } from 'hono'
import type { AppEnv } from '../lib/context.js'
import { env } from '../lib/env.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { encryptToken } from '../lib/crypto.js'

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const IG_APP_ID = '936619743392459' // public web app id IG's own site sends

/**
 * Authed connection routes (mounted at /api/connections, under requireAuth):
 *   GET    /                     — caller's connection state (no secrets)
 *   POST   /reddit/credential    — store the user's pasted Reddit cookie (verified)
 *   POST   /instagram/credential — store the user's pasted IG sessionid (verified)
 *   DELETE /reddit | /instagram  — disconnect (wipe credential + connection)
 *
 * No platform OAuth app: the user pastes their own browser credential (the same
 * mechanism the single-tenant pipeline uses), sidestepping platform app-approval
 * gates. The credential is AES-GCM encrypted at rest; only the worker's service
 * role can read it; it never goes back to the client.
 */

/** Verify a Reddit cookie by fetching one saved item. */
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

/**
 * Verify an Instagram sessionid against the authed current_user endpoint.
 * Returns 'invalid' only on an explicit logged-out signal; 'unknown' on a
 * network/ambiguous error (IG is hostile to datacenter IPs, so we don't block
 * a save on that — the worker re-validates and flags the connection if needed).
 */
async function verifyInstagramSession(sessionid: string): Promise<'ok' | 'invalid' | 'unknown'> {
  try {
    const res = await fetch('https://www.instagram.com/api/v1/accounts/current_user/?edit=true', {
      headers: { 'User-Agent': BROWSER_UA, 'X-IG-App-ID': IG_APP_ID, Cookie: `sessionid=${sessionid}` },
    })
    if (res.status === 401 || res.status === 403) return 'invalid'
    if (!res.ok) return 'unknown'
    const body = (await res.json()) as { status?: string; user?: unknown; message?: string }
    if (body?.status === 'ok' && body.user) return 'ok'
    if ((body?.message ?? '').includes('login_required')) return 'invalid'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Encrypt + persist a platform credential, mark the connection connected. */
async function storeCredential(
  c: Context<AppEnv>,
  platform: 'reddit' | 'instagram',
  credential: string,
  username: string,
): Promise<Response> {
  const userId = c.get('userId')
  const now = new Date().toISOString()
  const admin = supabaseAdmin()
  const conn = await admin.from('connections').upsert(
    { user_id: userId, platform, status: 'connected', reddit_username: username, scopes: 'cookie', connected_at: now, updated_at: now },
    { onConflict: 'user_id,platform' },
  )
  if (conn.error) return c.json({ error: conn.error.message }, 500)
  const sec = await admin.from('connection_secrets').upsert(
    { user_id: userId, platform, refresh_token_enc: encryptToken(credential), updated_at: now },
    { onConflict: 'user_id,platform' },
  )
  if (sec.error) return c.json({ error: sec.error.message }, 500)
  return c.json({ ok: true, username })
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
    if (!env.REDDIT_TOKEN_ENC_KEY) return c.json({ error: 'Connect is not configured on the server' }, 503)
    const body = (await c.req.json().catch(() => ({}))) as { cookie?: string; username?: string }
    const cookie = (body.cookie ?? '').trim()
    const username = (body.username ?? '').trim().replace(/^\/?u\//i, '')
    if (!cookie || !username) return c.json({ error: 'Both your Reddit cookie and username are required.' }, 400)
    if (!(await verifyRedditCookie(cookie, username))) {
      return c.json(
        { error: "Couldn't read your saved posts with that cookie. Double-check the username and that the cookie is fresh (copied while logged in)." },
        400,
      )
    }
    return storeCredential(c, 'reddit', cookie, username)
  })
  .post('/instagram/credential', async (c) => {
    if (!env.REDDIT_TOKEN_ENC_KEY) return c.json({ error: 'Connect is not configured on the server' }, 503)
    const body = (await c.req.json().catch(() => ({}))) as { sessionid?: string; username?: string }
    const sessionid = (body.sessionid ?? '').trim()
    const username = (body.username ?? '').trim().replace(/^@/, '')
    if (!sessionid || !username) return c.json({ error: 'Both your Instagram sessionid and username are required.' }, 400)
    if ((await verifyInstagramSession(sessionid)) === 'invalid') {
      return c.json(
        { error: "That Instagram session looks logged out. Copy a fresh sessionid cookie while logged in to instagram.com." },
        400,
      )
    }
    return storeCredential(c, 'instagram', sessionid, username)
  })
  .delete('/reddit', (c) => disconnect(c, 'reddit'))
  .delete('/instagram', (c) => disconnect(c, 'instagram'))

async function disconnect(c: Context<AppEnv>, platform: 'reddit' | 'instagram'): Promise<Response> {
  const userId = c.get('userId')
  const admin = supabaseAdmin()
  await admin.from('connection_secrets').delete().eq('user_id', userId).eq('platform', platform)
  await admin.from('connections').delete().eq('user_id', userId).eq('platform', platform)
  return c.json({ ok: true })
}
