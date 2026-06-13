/**
 * Shared Hono RPC client for @trove/api.
 *
 * One typed client reused by every data hook, so the request shapes and
 * response types are inferred from the backend route definitions. Point it at
 * the backend with VITE_API_URL (defaults to the local dev port).
 */
import { hc } from 'hono/client'
import type { AppType } from '@trove/api'
import { supabase } from '@/lib/supabase'

const API_URL =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787')
    .replace(/\/$/, '')

/**
 * Wrap fetch so every request carries the logged-in user's access token. The API
 * requires `Authorization: Bearer <jwt>` on /api/* (see apps/api auth middleware)
 * and RLS resolves it to auth.uid(). Reads the current session per request so a
 * refreshed token is always used.
 */
const authedFetch: typeof fetch = async (input, init) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}

export const api = hc<AppType>(API_URL, { fetch: authedFetch })
