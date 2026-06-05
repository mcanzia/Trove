/**
 * Single-recipe fetch — served by @trove/api (Hono) via its typed RPC client.
 *
 * GET {VITE_API_URL}/api/recipes/:postId returns the Food & Cooking
 * analysis_item plus its structured recipe card (or null) in one round-trip,
 * addressed by source_post_id (stable across re-analysis).
 *
 * Uses Hono's `hc<AppType>` client, so the request shape and the success
 * response type are inferred from the backend route definition — change the
 * route and this file fails to compile (no hand-written `as` cast).
 */

import { useQuery } from '@tanstack/react-query'
import { hc } from 'hono/client'
import type { AppType } from '@trove/api'
import type { RecipeResponse } from '@trove/shared'

const API_URL =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787')
    .replace(/\/$/, '')

const client = hc<AppType>(API_URL)

export type { RecipeResponse }

/** Fetch one recipe (item + card) by source_post_id. Returns null on 404. */
export function useRecipe(postId: string | null) {
  return useQuery<RecipeResponse | null>({
    queryKey: ['recipe', postId],
    enabled: !!postId,
    queryFn: async () => {
      const res = await client.api.recipes[':postId'].$get({
        param: { postId: postId as string },
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Failed to load recipe (${res.status})`)
      return res.json()
    },
    staleTime: 1000 * 60 * 10,
  })
}
