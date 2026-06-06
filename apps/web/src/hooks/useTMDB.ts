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
import { api } from '@/lib/api'
import type { TMDBLink } from '@trove/shared'

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

export type { TMDBLink }

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
      const res = await api.api.enrichments.tmdb.$get()
      if (!res.ok) throw new Error(`Failed to load TMDB links (${res.status})`)
      const rows = await res.json()
      return new Map(rows.map(({ analysisItemId, ...data }) => [analysisItemId, data]))
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
      const res = await api.api.enrichments.tmdb[':analysisItemId'].$put({
        param: { analysisItemId: String(analysisItemId) },
        json: { tmdbId, mediaType, tmdbTitle, posterUrl, tmdbRating, genres, releaseYear },
      })
      if (!res.ok) throw new Error(`Failed to save TMDB link (${res.status})`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tmdb-links'] }),
  })
}

export function useDeleteTMDBLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (analysisItemId: number) => {
      const res = await api.api.enrichments.tmdb[':analysisItemId'].$delete({
        param: { analysisItemId: String(analysisItemId) },
      })
      if (!res.ok) throw new Error(`Failed to delete TMDB link (${res.status})`)
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
      const res = await api.api.enrichments.tmdb[':analysisItemId'].score.$patch({
        param: { analysisItemId: String(analysisItemId) },
        json: { personalScore },
      })
      if (!res.ok) throw new Error(`Failed to update TMDB score (${res.status})`)
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
