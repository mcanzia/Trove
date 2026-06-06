/**
 * Fetch travel location pins, served by @trove/api
 * (GET /api/enrichments/travel-locations).
 * Returns a Map<analysisItemId, TravelLocation[]> for fast O(1) lookup.
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { TravelLocation } from '@trove/shared'

export type { TravelLocation }
export type TravelLocationsMap = Map<number, TravelLocation[]>

export function useTravelLocations(enabled = true) {
  return useQuery({
    queryKey: ['travel-locations'],
    queryFn: async (): Promise<TravelLocationsMap> => {
      const res = await api.api.enrichments['travel-locations'].$get()
      if (!res.ok) throw new Error(`Failed to load travel locations (${res.status})`)
      const rows = await res.json()

      const map: TravelLocationsMap = new Map()
      for (const { analysisItemId, ...loc } of rows) {
        const existing = map.get(analysisItemId)
        if (existing) existing.push(loc)
        else map.set(analysisItemId, [loc])
      }
      return map
    },
    staleTime: 1000 * 60 * 10,
    enabled,
  })
}
