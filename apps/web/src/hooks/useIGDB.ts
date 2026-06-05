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
import { api } from '@/lib/api'
import type { IGDBLink } from '@trove/shared'

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

export type { IGDBLink }

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
      const res = await api.api.enrichments.igdb.$get()
      if (!res.ok) throw new Error(`Failed to load IGDB links (${res.status})`)
      const rows = await res.json()
      return new Map(rows.map(({ analysisItemId, ...data }) => [analysisItemId, data]))
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
