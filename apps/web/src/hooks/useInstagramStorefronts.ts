/**
 * Reads pre-verified Amazon storefront URLs for Instagram accounts
 * that post product content. Served by @trove/api
 * (GET /api/enrichments/instagram-storefronts).
 *
 * Returns a Map<instagramOwner, storefrontUrl>.
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useInstagramStorefronts() {
  return useQuery({
    queryKey: ['instagram-storefronts'],
    queryFn: async (): Promise<Map<string, string>> => {
      const res = await api.api.enrichments['instagram-storefronts'].$get()
      if (!res.ok) throw new Error(`Failed to load storefronts (${res.status})`)
      const rows = await res.json()
      return new Map(rows.map(({ owner, storefrontUrl }) => [owner, storefrontUrl]))
    },
    staleTime: 1000 * 60 * 60, // 1 hour — storefronts don't change often
  })
}
