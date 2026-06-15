/**
 * Spotify enrichment for Music Recommendations.
 *
 * Metadata (track URL, album art, preview) is resolved by the sync pipeline via
 * Spotify's Client Credentials Search API and cached in spotify_links, so the
 * frontend just reads the map (GET /api/enrichments/spotify).
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SpotifyLink } from '@trove/shared'

export type { SpotifyLink }

/** Returns a Map<analysisItemId, SpotifyLink> for all stored Spotify links. */
export function useSpotifyLinks() {
  return useQuery({
    queryKey: ['spotify-links'],
    queryFn: async (): Promise<Map<number, SpotifyLink>> => {
      const res = await api.api.enrichments.spotify.$get()
      if (!res.ok) throw new Error(`Failed to load Spotify links (${res.status})`)
      const rows = await res.json()
      return new Map(rows.map(({ analysisItemId, ...data }) => [analysisItemId, data]))
    },
    staleTime: 1000 * 60 * 10,
  })
}
