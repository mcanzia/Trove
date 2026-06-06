/**
 * BGG (BoardGameGeek) enrichment for Board Games.
 *
 * Read map is served by @trove/api (GET /api/enrichments/bgg). The delete
 * mutation still writes via supabase-js (covered by a later write/RLS batch).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'
import type { BGGLinkData } from '@trove/shared'

export type { BGGLinkData }

/** Returns a Map<analysisItemId, BGGLinkData> for all stored BGG links. */
export function useBGGLinks() {
  return useQuery({
    queryKey: ['bgg-links'],
    queryFn: async (): Promise<Map<number, BGGLinkData>> => {
      const res = await api.api.enrichments.bgg.$get()
      if (!res.ok) throw new Error(`Failed to load BGG links (${res.status})`)
      const rows = await res.json()
      return new Map(rows.map(({ analysisItemId, ...data }) => [analysisItemId, data]))
    },
    staleTime: 1000 * 60 * 10,
  })
}

/** Deletes a bgg_links row (for manual re-linking). */
export function useDeleteBGGLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (analysisItemId: number) => {
      const { error } = await supabase
        .from('bgg_links')
        .delete()
        .eq('analysis_item_id', analysisItemId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bgg-links'] }),
  })
}
