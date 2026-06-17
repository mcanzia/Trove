/**
 * IGDB API proxy (via Twitch client credentials OAuth)
 *
 * IGDB is owned by Twitch. Authentication is server-side only (client credentials
 * grant) — no user-facing OAuth flow is needed or supported.
 *
 * The access token is cached in module-level state and refreshed automatically
 * when it expires (~60 days). Each cold-start fetches a fresh token.
 *
 * Handles two actions:
 *   search  — search for games by title
 *   game    — fetch full details for a specific game ID
 *
 * Required secrets:
 *   npx supabase secrets set IGDB_CLIENT_ID=<id> IGDB_CLIENT_SECRET=<secret>
 */

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const IGDB_API_BASE    = 'https://api.igdb.com/v4'

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

// ── Token cache (module-level, survives warm invocations) ─────────────────────

let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken

  const resp = await fetch(
    `${TWITCH_TOKEN_URL}?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: 'POST' },
  )
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Twitch token error: ${err}`)
  }
  const data = await resp.json() as { access_token: string; expires_in: number }
  cachedToken    = data.access_token
  tokenExpiresAt = Date.now() + data.expires_in * 1000
  return cachedToken
}

// ── IGDB query helper ─────────────────────────────────────────────────────────

async function igdbQuery<T>(
  endpoint: string,
  body: string,
  clientId: string,
  accessToken: string,
): Promise<T> {
  const resp = await fetch(`${IGDB_API_BASE}/${endpoint}`, {
    method:  'POST',
    headers: {
      'Client-ID':     clientId,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'text/plain',
    },
    body,
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`IGDB error (${resp.status}): ${err}`)
  }
  return resp.json() as Promise<T>
}

// ── Cover image URL helper ────────────────────────────────────────────────────

function coverUrl(imageId: string | undefined, size = 'cover_big'): string | null {
  if (!imageId) return null
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface IGDBGame {
  id:                   number
  name:                 string
  cover?:               { image_id: string }
  rating?:              number
  aggregated_rating?:   number
  genres?:              Array<{ name: string }>
  platforms?:           Array<{ name: string }>
  first_release_date?:  number   // Unix timestamp
  summary?:             string
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const clientId     = Deno.env.get('IGDB_CLIENT_ID')
  const clientSecret = Deno.env.get('IGDB_CLIENT_SECRET')
  if (!clientId || !clientSecret) return json({ error: 'IGDB credentials not configured' }, 500)

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return json({ error: 'Invalid JSON body' }, 400) }

  let accessToken: string
  try { accessToken = await getAccessToken(clientId, clientSecret) }
  catch (e) { return json({ error: String(e) }, 500) }

  const { action } = body

  // ── Search games ──────────────────────────────────────────────────────────
  if (action === 'search') {
    // Sanitise/clamp untrusted input before it reaches the IGDB query string:
    // strip quotes + backslashes (can't break out of the search literal), cap
    // length, and clamp limit to a sane integer range.
    const query = (typeof body.query === 'string' ? body.query : '')
      .replace(/["\\]/g, '')
      .slice(0, 200)
      .trim()
    if (!query) return json({ error: 'query is required' }, 400)
    const limit = Math.min(Math.max(Math.trunc(Number(body.limit) || 10), 1), 50)
    try {
      const games = await igdbQuery<IGDBGame[]>(
        'games',
        `fields id,name,cover.image_id,rating,aggregated_rating,genres.name,platforms.name,first_release_date;
         search "${query}";
         limit ${limit};
         where version_parent = null;`,
        clientId,
        accessToken,
      )
      return json(games.map((g) => ({
        igdbId:      g.id,
        title:       g.name,
        coverUrl:    coverUrl(g.cover?.image_id),
        rating:      g.rating ?? g.aggregated_rating ?? null,
        genres:      (g.genres ?? []).map((x) => x.name),
        platforms:   (g.platforms ?? []).map((x) => x.name),
        releaseYear: g.first_release_date
          ? new Date(g.first_release_date * 1000).getFullYear()
          : null,
      })))
    } catch (e) {
      return json({ error: String(e) }, 500)
    }
  }

  // ── Get game details by ID ────────────────────────────────────────────────
  if (action === 'game') {
    // igdbId is interpolated straight into the query — require a positive int so
    // a string body can't inject extra IGDB query clauses.
    const igdbId = Math.trunc(Number((body as { igdbId?: unknown }).igdbId))
    if (!Number.isInteger(igdbId) || igdbId <= 0) {
      return json({ error: 'igdbId must be a positive integer' }, 400)
    }
    try {
      const games = await igdbQuery<IGDBGame[]>(
        'games',
        `fields id,name,cover.image_id,rating,aggregated_rating,genres.name,platforms.name,first_release_date,summary;
         where id = ${igdbId};`,
        clientId,
        accessToken,
      )
      const g = games[0]
      if (!g) return json({ error: 'Game not found' }, 404)
      return json({
        igdbId:      g.id,
        title:       g.name,
        coverUrl:    coverUrl(g.cover?.image_id),
        rating:      g.rating ?? g.aggregated_rating ?? null,
        genres:      (g.genres ?? []).map((x) => x.name),
        platforms:   (g.platforms ?? []).map((x) => x.name),
        releaseYear: g.first_release_date
          ? new Date(g.first_release_date * 1000).getFullYear()
          : null,
        summary:     g.summary ?? null,
      })
    } catch (e) {
      return json({ error: String(e) }, 500)
    }
  }

  // ── Batch sync: search all titles, 4 at a time to stay under rate limit ──────
  if (action === 'batch-sync') {
    const { titles } = body as { titles: string[] }
    if (!Array.isArray(titles) || !titles.length) return json([])
    // Bound the work a single call can request (each title is its own IGDB query).
    if (titles.length > 200) return json({ error: 'too many titles (max 200)' }, 400)

    const FIELDS   = 'id,name,cover.image_id,rating,aggregated_rating,genres.name,platforms.name,first_release_date'
    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const BATCH    = 4    // IGDB free tier: 4 req/s
    const DELAY_MS = 1100 // slightly over 1s to be safe

    const out: Array<{
      title: string; igdbId: number; igdbTitle: string
      coverUrl: string | null; rating: number | null
      genres: string[]; platforms: string[]; releaseYear: number | null
    }> = []

    try {
      for (let i = 0; i < titles.length; i += BATCH) {
        const chunk = titles.slice(i, i + BATCH)

        // Fire this chunk in parallel
        const results = await Promise.all(
          chunk.map((t) => {
            const safe = t.replace(/"/g, '').replace(/\\/g, '')
            return igdbQuery<IGDBGame[]>(
              'games',
              `fields ${FIELDS}; search "${safe}"; limit 5;`,
              clientId,
              accessToken,
            ).catch(() => [] as IGDBGame[])  // skip on error, don't abort whole sync
          })
        )

        for (let j = 0; j < chunk.length; j++) {
          const orig    = chunk[j]
          const games   = results[j]
          if (!games.length) continue
          // Prefer exact normalised match, fall back to top search result
          const match = games.find((g) => normalise(g.name) === normalise(orig)) ?? games[0]
          out.push({
            title:       orig,
            igdbId:      match.id,
            igdbTitle:   match.name,
            coverUrl:    coverUrl(match.cover?.image_id),
            rating:      match.rating ?? match.aggregated_rating ?? null,
            genres:      (match.genres ?? []).map((x) => x.name),
            platforms:   (match.platforms ?? []).map((x) => x.name),
            releaseYear: match.first_release_date
              ? new Date(match.first_release_date * 1000).getFullYear()
              : null,
          })
        }

        // Pause between batches (skip delay after the last batch)
        if (i + BATCH < titles.length) {
          await new Promise((r) => setTimeout(r, DELAY_MS))
        }
      }

      return json(out)
    } catch (e) {
      return json({ error: String(e) }, 500)
    }
  }

  return json({ error: `Unknown action: ${action}` }, 400)
})
