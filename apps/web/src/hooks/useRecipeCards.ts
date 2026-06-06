/**
 * Recipe-card enrichment map for Food & Cooking.
 *
 * Served by @trove/api (GET /api/recipes). Keyed by source_post_id (the
 * original post ID) so cards survive Food re-analysis — analysis_item IDs
 * churn, the source post never does. No auth required.
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { RecipeCardData } from '@trove/shared'

export type { RecipeCardData }

/** Returns a Map<sourcePostId, RecipeCardData> for all stored recipe cards. */
export function useRecipeCards() {
  return useQuery({
    queryKey: ['recipe-cards'],
    queryFn: async (): Promise<Map<string, RecipeCardData>> => {
      const res = await api.api.recipes.$get()
      if (!res.ok) throw new Error(`Failed to load recipe cards (${res.status})`)
      const rows = await res.json()
      return new Map(rows.map(({ sourcePostId, ...card }) => [sourcePostId, card]))
    },
    staleTime: 1000 * 60 * 10,
  })
}
