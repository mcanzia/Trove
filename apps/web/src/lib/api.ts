/**
 * Shared Hono RPC client for @trove/api.
 *
 * One typed client reused by every data hook, so the request shapes and
 * response types are inferred from the backend route definitions. Point it at
 * the backend with VITE_API_URL (defaults to the local dev port).
 */
import { hc } from 'hono/client'
import type { AppType } from '@trove/api'

const API_URL =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787')
    .replace(/\/$/, '')

export const api = hc<AppType>(API_URL)
