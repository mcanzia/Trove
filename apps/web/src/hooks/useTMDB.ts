/**
 * TMDB (The Movie Database) hooks.
 *
 * Used for Movies & Film Recommendations and TV Series Recommendations.
 * TMDB uses a simple API key — all calls go through the tmdb-proxy Edge Function.
 *
 * Metadata (poster, rating, genres) is cached in tmdb_links so subsequent
 * page loads read from the DB with no TMDB API calls needed.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TMDBTitle {
  tmdbId:      number
  title:       string
  posterUrl:   string | null
  rating:      number | null   // 0–10 TMDB community rating
  genres:      string[]
  releaseYear: number | null
  mediaType:   'movie' | 'tv'
}

export interface TMDBLink {
  tmdbId:        number
  tmdbTitle:     string | null
  mediaType:     'movie' | 'tv'
  personalScore: number | null   // 1–10, null = unrated
  posterUrl:     string | null
  tmdbRating:    number | null
  genres:        string[]
  releaseYear:   number | null
}

// ── Proxy helper ──────────────────────────────────────────────────────────────

async function tmdbProxy<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tmdb-proxy', { body })
  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
  return data as T
}

// ── Search ────────────────────────────────────────────────────────────────────

export function useSearchTMDB() {
  return useMutation({
    mutationFn: async ({
      query,
      mediaType,
    }: {
      query:     string
      mediaType: 'movie' | 'tv'
    }): Promise<TMDBTitle[]> => {
      return tmdbProxy<TMDBTitle[]>({ action: 'search', query, mediaType, limit: 10 })
    },
  })
}

// ── Links (analysis_item_id → TMDBLink with cached metadata) ─────────────────

export function useTMDBLinks() {
  return useQuery({
    queryKey: ['tmdb-links'],
    queryFn:  async (): Promise<Map<number, TMDBLink>> => {
      const { data, error } = await supabase
        .from('tmdb_links')
        .select('analysis_item_id, tmdb_id, media_type, tmdb_title, personal_score, poster_url, tmdb_rating, genres, release_year')
      if (error) throw error
      return new Map((data ?? []).map((r) => [
        r.analysis_item_id as number,
        {
          tmdbId:        r.tmdb_id        as number,
          tmdbTitle:     r.tmdb_title     as string | null,
          mediaType:     r.media_type     as 'movie' | 'tv',
          personalScore: r.personal_score as number | null,
          posterUrl:     r.poster_url     as string | null,
          tmdbRating:    r.tmdb_rating    as number | null,
          genres:        (r.genres        as string[] | null) ?? [],
          releaseYear:   r.release_year   as number | null,
        },
      ]))
    },
    staleTime: 1000 * 60 * 10,
  })
}

export function useUpsertTMDBLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      analysisItemId,
      tmdbId,
      mediaType,
      tmdbTitle,
      posterUrl,
      tmdbRating,
      genres,
      releaseYear,
    }: {
      analysisItemId: number
      tmdbId:         number
      mediaType:      'movie' | 'tv'
      tmdbTitle?:     string | null
      posterUrl?:     string | null
      tmdbRating?:    number | null
      genres?:        string[]
      releaseYear?:   number | null
    }) => {
      const { error } = await supabase
        .from('tmdb_links')
        .upsert({
          analysis_item_id: analysisItemId,
          tmdb_id:          tmdbId,
          media_type:       mediaType,
          tmdb_title:       tmdbTitle   ?? null,
          poster_url:       posterUrl   ?? null,
          tmdb_rating:      tmdbRating  ?? null,
          genres:           genres      ?? [],
          release_year:     releaseYear ?? null,
        })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tmdb-links'] }),
  })
}

export function useDeleteTMDBLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (analysisItemId: number) => {
      const { error } = await supabase
        .from('tmdb_links')
        .delete()
        .eq('analysis_item_id', analysisItemId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tmdb-links'] }),
  })
}

export function useUpdateTMDBScore() {
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
        .from('tmdb_links')
        .update({ personal_score: personalScore })
        .eq('analysis_item_id', analysisItemId)
      if (error) throw error
    },
    onMutate: async ({ analysisItemId, personalScore }) => {
      await qc.cancelQueries({ queryKey: ['tmdb-links'] })
      const prev = qc.getQueryData<Map<number, TMDBLink>>(['tmdb-links'])
      if (prev) {
        const next = new Map(prev)
        const existing = next.get(analysisItemId)
        if (existing) next.set(analysisItemId, { ...existing, personalScore })
        qc.setQueryData(['tmdb-links'], next)
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tmdb-links'], ctx.prev)
    },
  })
}
