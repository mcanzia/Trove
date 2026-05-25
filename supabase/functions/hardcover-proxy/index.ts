/**
 * Hardcover GraphQL proxy
 *
 * Forwards any GraphQL query or mutation to the Hardcover API using a
 * server-side token so the token is never exposed to the browser.
 *
 * Set the token once:
 *   npx supabase secrets set HARDCOVER_TOKEN=<your-token>
 *
 * Invoke from the client:
 *   supabase.functions.invoke('hardcover-proxy', {
 *     body: { query: '...', variables: { ... } }
 *   })
 */

const HARDCOVER_URL = 'https://api.hardcover.app/v1/graphql'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const token = Deno.env.get('HARDCOVER_TOKEN')
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'HARDCOVER_TOKEN secret is not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }

  let body: { query: string; variables?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }

  const upstream = await fetch(HARDCOVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const data = await upstream.json()

  return new Response(JSON.stringify(data), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
})
