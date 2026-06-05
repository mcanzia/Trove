/**
 * IGDB (Internet Game Database) hooks.
 *
 * IGDB uses Twitch client-credentials OAuth — server-side only, no user login.
 * All API calls go through the igdb-proxy Edge Function which manages the token.
 *
 * Game metadata (cover, rating, genres, platforms) is cached directly in the
 * igdb_links Supabase table on first link, so subsequent page loads read from
 * the DB with no IGDB API calls needed.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IGDBGame {
  igdbId:      number
  title:       string
  coverUrl:    string | null
  rating:      number | null   // 0–100 community rating
  genres:      string[]
  platforms:   string[]
  releaseYear: number | null
  summary?:    string | null
}

export interface IGDBLink {
  igdbGameId:    number
  igdbTitle:     string | null
  personalScore: number | null  // 1–10, null = unrated
  // Cached game metadata — populated on link, no extra API call needed
  coverUrl:      string | null
  igdbRating:    number | null
  genres:        string[]
  platforms:     string[]
  releaseYear:   number | null
}

// ── Proxy helper ──────────────────────────────────────────────────────────────

async function igdbProxy<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('igdb-proxy', { body })
  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
  return data as T
}

// ── Search ────────────────────────────────────────────────────────────────────

export function useSearchIGDB() {
  return useMutation({
    mutationFn: async ({ query }: { query: string }): Promise<IGDBGame[]> => {
      return igdbProxy<IGDBGame[]>({ action: 'search', query, limit: 10 })
    },
  })
}

// ── Links (analysis_item_id → IGDBLink with cached game data) ─────────────────

export function useIGDBLinks() {
  return useQuery({
    queryKey: ['igdb-links'],
    queryFn:  async (): Promise<Map<number, IGDBLink>> => {
      const { data, error } = await supabase
        .from('igdb_links')
        .select('analysis_item_id, igdb_game_id, game_title, personal_score, cover_url, igdb_rating, genres, platforms, release_year')
      if (error) throw error
      return new Map((data ?? []).map((r) => [
        r.analysis_item_id as number,
        {
          igdbGameId:    r.igdb_game_id    as number,
          igdbTitle:     r.game_title      as string | null,
          personalScore: r.personal_score  as number | null,
          coverUrl:      r.cover_url       as string | null,
          igdbRating:    r.igdb_rating     as number | null,
          genres:        (r.genres         as string[] | null) ?? [],
          platforms:     (r.platforms      as string[] | null) ?? [],
          releaseYear:   r.release_year    as number | null,
        },
      ]))
    },
    staleTime: 1000 * 60 * 10,
  })
}

export function useUpsertIGDBLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      analysisItemId,
      igdbGameId,
      gameTitle,
      coverUrl,
      igdbRating,
      genres,
      platforms,
      releaseYear,
    }: {
      analysisItemId: number
      igdbGameId:     number
      gameTitle?:     string | null
      coverUrl?:      string | null
      igdbRating?:    number | null
      genres?:        string[]
      platforms?:     string[]
      releaseYear?:   number | null
    }) => {
      const { error } = await supabase
        .from('igdb_links')
        .upsert({
          analysis_item_id: analysisItemId,
          igdb_game_id:     igdbGameId,
          game_title:       gameTitle   ?? null,
          cover_url:        coverUrl    ?? null,
          igdb_rating:      igdbRating  ?? null,
          genres:           genres      ?? [],
          platforms:        platforms   ?? [],
          release_year:     releaseYear ?? null,
        })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['igdb-links'] }),
  })
}

export function useDeleteIGDBLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (analysisItemId: number) => {
      const { error } = await supabase
        .from('igdb_links')
        .delete()
        .eq('analysis_item_id', analysisItemId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['igdb-links'] }),
  })
}

export function useUpdateIGDBScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      analysisItemId,
      personalScore,
    }: {
      analysisItemId: number
      personalScore:  number | null
    }) => {
      const { error } = await supabase
        .from('igdb_links')
        .update({ personal_score: personalScore })
        .eq('analysis_item_id', analysisItemId)
      if (error) throw error
    },
    onMutate: async ({ analysisItemId, personalScore }) => {
      await qc.cancelQueries({ queryKey: ['igdb-links'] })
      const prev = qc.getQueryData<Map<number, IGDBLink>>(['igdb-links'])
      if (prev) {
        const next = new Map(prev)
        const existing = next.get(analysisItemId)
        if (existing) next.set(analysisItemId, { ...existing, personalScore })
        qc.setQueryData(['igdb-links'], next)
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['igdb-links'], ctx.prev)
    },
  })
}
