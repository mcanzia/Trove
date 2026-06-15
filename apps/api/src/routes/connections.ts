import { Hono, type Context } from 'hono'
import type { AppEnv } from '../lib/context.js'
import { env } from '../lib/env.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { encryptToken, signState, verifyState } from '../lib/crypto.js'

const REDDIT_SCOPES = 'identity history'
const UA = 'web:trove:v1'

/**
 * Authed connection routes (mounted at /api/connections, under requireAuth):
 *   GET  /                 — caller's connection state (no secrets)
 *   POST /reddit/start     — returns the Reddit authorize URL (signed-state CSRF)
 *
 * The OAuth callback is exported separately (redditCallback) and mounted at a
 * top-level, UNAUTHENTICATED path in app.ts — a browser redirect from Reddit
 * carries no bearer token, so identity comes from the signed state instead.
 */
export const connections = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { data, error } = await c.get('supabase')
      .from('connections')
      .select('platform, status, reddit_username, scopes, connected_at, last_synced_at')
    if (error) return c.json({ error: error.message }, 500)
    return c.json({ connections: data ?? [] })
  })
  .post('/reddit/start', (c) => {
    if (!env.REDDIT_CLIENT_ID || !env.REDDIT_REDIRECT_URI || !env.REDDIT_TOKEN_ENC_KEY) {
      return c.json({ error: 'Reddit connect is not configured on the server' }, 503)
    }
    const state = signState(c.get('userId'))
    const url = new URL('https://www.reddit.com/api/v1/authorize')
    url.search = new URLSearchParams({
      client_id: env.REDDIT_CLIENT_ID,
      response_type: 'code',
      state,
      redirect_uri: env.REDDIT_REDIRECT_URI,
      duration: 'permanent',
      scope: REDDIT_SCOPES,
    }).toString()
    return c.json({ url: url.toString() })
  })

/** Unauthenticated browser-redirect callback (mounted top-level in app.ts). */
export async function redditCallback(c: Context<AppEnv>): Promise<Response> {
  const back = (q: string) => c.redirect(`${env.WEB_ORIGIN ?? ''}/connections?${q}`)
  const code = c.req.query('code')
  const state = c.req.query('state')
  if (c.req.query('error')) return back(`reddit=error&reason=${encodeURIComponent(c.req.query('error')!)}`)
  if (!code || !state) return back('reddit=error&reason=missing_code')

  let userId: string
  try {
    userId = verifyState(state)
  } catch {
    return back('reddit=error&reason=bad_state')
  }

  try {
    const basic = Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString('base64')
    const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.REDDIT_REDIRECT_URI!,
      }),
    })
    if (!tokenRes.ok) return back('reddit=error&reason=token_exchange')
    const tok = (await tokenRes.json()) as { refresh_token?: string; access_token?: string }
    if (!tok.refresh_token || !tok.access_token) return back('reddit=error&reason=no_refresh_token')

    const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
      headers: { Authorization: `Bearer ${tok.access_token}`, 'User-Agent': UA },
    })
    const username = meRes.ok ? ((await meRes.json()) as { name?: string }).name ?? null : null

    const now = new Date().toISOString()
    const admin = supabaseAdmin()
    await admin.from('connections').upsert(
      { user_id: userId, platform: 'reddit', status: 'connected', reddit_username: username, scopes: REDDIT_SCOPES, connected_at: now, updated_at: now },
      { onConflict: 'user_id,platform' },
    )
    await admin.from('connection_secrets').upsert(
      { user_id: userId, platform: 'reddit', refresh_token_enc: encryptToken(tok.refresh_token), updated_at: now },
      { onConflict: 'user_id,platform' },
    )
    return back('reddit=connected')
  } catch {
    return back('reddit=error&reason=server')
  }
}
