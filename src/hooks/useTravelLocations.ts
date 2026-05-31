/**
 * Fetch travel location pins from the travel_locations table.
 * Returns a Map<analysisItemId, TravelLocation[]> for fast O(1) lookup.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TravelLocation {
  lat:   number
  lng:   number
  label: string
  type:  string   // 'poi' | 'city_fallback' | 'address' | etc.
}

export type TravelLocationsMap = Map<number, TravelLocation[]>

export function useTravelLocations(enabled = true) {
  return useQuery({
    queryKey: ['travel-locations'],
    queryFn:  async (): Promise<TravelLocationsMap> => {
      const { data, error } = await supabase
        .from('travel_locations')
        .select('analysis_item_id, lat, lng, label, type')
      if (error) throw error

      const map = new Map<number, TravelLocation[]>()
      for (const row of data ?? []) {
        const id = row.analysis_item_id as number
        if (!map.has(id)) map.set(id, [])
        map.get(id)!.push({
          lat:   row.lat   as number,
          lng:   row.lng   as number,
          label: row.label as string,
          type:  row.type  as string,
        })
      }
      return map
    },
    staleTime: 1000 * 60 * 10,
    enabled,
  })
}
