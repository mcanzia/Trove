/**
 * MyAnimeList OAuth + API proxy
 *
 * Handles three actions:
 *   exchange  — trades an OAuth auth code + PKCE verifier for tokens
 *   refresh   — refreshes an expired access token
 *   api       — proxies any MAL API v2 request (keeps client_secret server-side)
 *
 * Required secrets:
 *   npx supabase secrets set MAL_CLIENT_ID=<id> MAL_CLIENT_SECRET=<secret>
 */

const MAL_API_BASE  = 'https://api.myanimelist.net/v2'
const MAL_TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const clientId     = Deno.env.get('MAL_CLIENT_ID')
  const clientSecret = Deno.env.get('MAL_CLIENT_SECRET')
  if (!clientId || !clientSecret) return json({ error: 'MAL credentials not configured' }, 500)

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return json({ error: 'Invalid JSON body' }, 400) }

  const { action } = body

  // ── Exchange auth code for tokens ─────────────────────────────────────────
  if (action === 'exchange') {
    const { code, codeVerifier, redirectUri } = body as {
      code: string; codeVerifier: string; redirectUri: string
    }
    const params = new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type:    'authorization_code',
      redirect_uri:  redirectUri,
    })
    const resp = await fetch(MAL_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    })
    return json(await resp.json(), resp.status)
  }

  // ── Refresh access token ──────────────────────────────────────────────────
  if (action === 'refresh') {
    const { refreshToken } = body as { refreshToken: string }
    const params = new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    })
    const resp = await fetch(MAL_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    })
    return json(await resp.json(), resp.status)
  }

  // ── Proxy MAL API v2 call ─────────────────────────────────────────────────
  if (action === 'api') {
    const { method = 'GET', path, apiBody, accessToken } = body as {
      method?:     string
      path:        string
      apiBody?:    Record<string, string>
      accessToken: string
    }
    const url     = `${MAL_API_BASE}${path}`
    const headers: Record<string, string> = {
      'Authorization':  `Bearer ${accessToken}`,
      'X-MAL-Client-ID': clientId,
    }
    let fetchBody: string | undefined
    if ((method === 'PATCH' || method === 'PUT' || method === 'POST') && apiBody) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      fetchBody = new URLSearchParams(apiBody).toString()
    }
    const resp = await fetch(url, { method, headers, body: fetchBody })
    // 204 No Content — return empty object
    if (resp.status === 204) return json({}, 204)
    return json(await resp.json(), resp.status)
  }

  return json({ error: `Unknown action: ${action}` }, 400)
})
