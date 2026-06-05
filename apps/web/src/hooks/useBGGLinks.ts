/**
 * BGG (BoardGameGeek) enrichment for Board Games.
 *
 * Reads from `bgg_links` which is populated by the Python sync script.
 * No auth required — BGG data is public.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BGGLinkData {
  bggGameId:    number
  gameTitle:    string | null
  coverUrl:     string | null
  thumbnailUrl: string | null
  bggRating:    number | null   // community rating out of 10
  bggWeight:    number | null   // complexity 1–5
  yearPublished: number | null
  minPlayers:   number | null
  maxPlayers:   number | null
  playingTime:  number | null
  categories:   string[]
  mechanics:    string[]
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Returns a Map<analysisItemId, BGGLinkData> for all stored BGG links. */
export function useBGGLinks() {
  return useQuery({
    queryKey: ['bgg-links'],
    queryFn: async (): Promise<Map<number, BGGLinkData>> => {
      const { data, error } = await supabase
        .from('bgg_links')
        .select('analysis_item_id, bgg_game_id, game_title, cover_url, thumbnail_url, bgg_rating, bgg_weight, year_published, min_players, max_players, playing_time, categories, mechanics')
      if (error) throw error
      return new Map((data ?? []).map((r) => [
        r.analysis_item_id as number,
        {
          bggGameId:    r.bgg_game_id    as number,
          gameTitle:    r.game_title     as string | null,
          coverUrl:     r.cover_url      as string | null,
          thumbnailUrl: r.thumbnail_url  as string | null,
          bggRating:    r.bgg_rating     as number | null,
          bggWeight:    r.bgg_weight     as number | null,
          yearPublished: r.year_published as number | null,
          minPlayers:   r.min_players    as number | null,
          maxPlayers:   r.max_players    as number | null,
          playingTime:  r.playing_time   as number | null,
          categories:   (r.categories as string[] | null) ?? [],
          mechanics:    (r.mechanics  as string[] | null) ?? [],
        },
      ]))
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
