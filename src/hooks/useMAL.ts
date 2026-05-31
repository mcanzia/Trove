/**
 * MAL anime-list hooks — mirrors the Hardcover integration pattern.
 *
 * Primary lookup uses mal_links (analysis_item_id → malAnimeId).
 * Title matching is a substring fallback only.
 */

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  loadTokens, saveTokens, clearTokens, isExpired,
  generatePKCE, buildAuthUrl, saveVerifier,
  type MALTokens,
} from '@/lib/malAuth'

// ── Constants ─────────────────────────────────────────────────────────────────

export const MAL_STATUS: Record<string, string> = {
  watching:      'Watching',
  completed:     'Completed',
  on_hold:       'On Hold',
  dropped:       'Dropped',
  plan_to_watch: 'Plan to Watch',
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MALAnimeEntry {
  malId:    number
  title:    string
  status:   string   // watching | completed | on_hold | dropped | plan_to_watch
  score:    number   // 0 = unrated, 1–10
  imageUrl: string | null
}

export interface MALLibrary {
  byId:    Map<number, MALAnimeEntry>
  byTitle: Map<string, MALAnimeEntry>   // normalised title → entry
}

export interface MALSearchResult {
  malId:    number
  title:    string
  imageUrl: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function normaliseAnimeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function findMALEntry(
  library: MALLibrary,
  title:   string,
  malAnimeId?: number,
): MALAnimeEntry | undefined {
  if (malAnimeId != null) {
    const byId = library.byId.get(malAnimeId)
    if (byId) return byId
  }
  const key = normaliseAnimeTitle(title)
  if (library.byTitle.has(key)) return library.byTitle.get(key)
  for (const [k, entry] of library.byTitle) {
    if (k.includes(key) || key.includes(k)) return entry
  }
  return undefined
}

function patchLibrary(
  library: MALLibrary,
  malId:   number,
  patch:   Partial<MALAnimeEntry>,
): MALLibrary {
  const newById    = new Map(library.byId)
  const newByTitle = new Map(library.byTitle)
  const existing   = newById.get(malId)
  if (existing) {
    const updated = { ...existing, ...patch }
    newById.set(malId, updated)
    newByTitle.set(normaliseAnimeTitle(existing.title), updated)
  }
  return { byId: newById, byTitle: newByTitle }
}

// ── Core proxy helper ─────────────────────────────────────────────────────────

async function malProxy<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('mal-proxy', { body })
  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
  return data as T
}

async function getValidAccessToken(): Promise<string> {
  const tokens = loadTokens()
  if (!tokens) throw new Error('Not authenticated with MAL')
  if (!isExpired(tokens)) return tokens.accessToken

  // Token expired — refresh it
  const resp = await malProxy<{
    access_token: string; refresh_token: string; expires_in: number
  }>({ action: 'refresh', refreshToken: tokens.refreshToken })

  const refreshed: MALTokens = {
    accessToken:  resp.access_token,
    refreshToken: resp.refresh_token,
    expiresAt:    Date.now() + resp.expires_in * 1000,
  }
  saveTokens(refreshed)
  return refreshed.accessToken
}

// ── Auth hook ─────────────────────────────────────────────────────────────────

export function useMALAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!loadTokens())

  const login = useCallback(async () => {
    const clientId    = import.meta.env.VITE_MAL_CLIENT_ID as string
    const redirectUri = import.meta.env.VITE_MAL_REDIRECT_URI as string
    if (!clientId || !redirectUri) {
      console.error('VITE_MAL_CLIENT_ID or VITE_MAL_REDIRECT_URI not set')
      return
    }
    const state = crypto.getRandomValues(new Uint8Array(16))
      .reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')
    const { verifier, challenge } = await generatePKCE()
    saveVerifier(verifier, state)
    window.location.href = buildAuthUrl(clientId, redirectUri, challenge, state)
  }, [])

  const logout = useCallback(() => {
    clearTokens()
    setIsAuthenticated(false)
  }, [])

  const markAuthenticated = useCallback(() => setIsAuthenticated(true), [])

  return { isAuthenticated, login, logout, markAuthenticated }
}

// ── Anime list ────────────────────────────────────────────────────────────────

interface MALListResponse {
  data: Array<{
    node: {
      id:                  number
      title:               string
      main_picture?:       { medium?: string }
      alternative_titles?: { en?: string; ja?: string; synonyms?: string[] }
    }
    list_status: { status: string; score: number }
  }>
}

export function useMALAnimeList() {
  return useQuery({
    queryKey: ['mal-animelist'],
    queryFn:  async (): Promise<MALLibrary> => {
      const accessToken = await getValidAccessToken()
      const resp = await malProxy<MALListResponse>({
        action:      'api',
        method:      'GET',
        path:        '/users/@me/animelist?fields=list_status,main_picture,alternative_titles&limit=1000&sort=list_updated_at',
        accessToken,
      })
      const byId    = new Map<number, MALAnimeEntry>()
      const byTitle = new Map<string, MALAnimeEntry>()
      for (const item of resp.data ?? []) {
        const entry: MALAnimeEntry = {
          malId:    item.node.id,
          title:    item.node.title,
          status:   item.list_status.status,
          score:    item.list_status.score,
          imageUrl: item.node.main_picture?.medium ?? null,
        }
        byId.set(entry.malId, entry)

        // Index by all title variants so both English and Japanese titles resolve
        const titles = [
          item.node.title,
          item.node.alternative_titles?.en,
          item.node.alternative_titles?.ja,
          ...(item.node.alternative_titles?.synonyms ?? []),
        ]
        for (const t of titles) {
          if (t) byTitle.set(normaliseAnimeTitle(t), entry)
        }
      }
      return { byId, byTitle }
    },
    staleTime: 1000 * 60 * 5,
    retry:     false,
    enabled:   !!loadTokens(),
  })
}

// ── Update status ─────────────────────────────────────────────────────────────

export function useUpdateMALStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ malId, status }: { malId: number; status: string }) => {
      const accessToken = await getValidAccessToken()
      return malProxy({
        action: 'api', method: 'PATCH',
        path:   `/anime/${malId}/my_list_status`,
        apiBody: { status },
        accessToken,
      })
    },
    onMutate: async ({ malId, status }) => {
      await qc.cancelQueries({ queryKey: ['mal-animelist'] })
      const prev = qc.getQueryData<MALLibrary>(['mal-animelist'])
      if (prev) qc.setQueryData(['mal-animelist'], patchLibrary(prev, malId, { status }))
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['mal-animelist'], ctx.prev) },
  })
}

// ── Update score ──────────────────────────────────────────────────────────────

export function useUpdateMALScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ malId, score }: { malId: number; score: number }) => {
      const accessToken = await getValidAccessToken()
      return malProxy({
        action: 'api', method: 'PATCH',
        path:   `/anime/${malId}/my_list_status`,
        apiBody: { score: String(score) },
        accessToken,
      })
    },
    onMutate: async ({ malId, score }) => {
      await qc.cancelQueries({ queryKey: ['mal-animelist'] })
      const prev = qc.getQueryData<MALLibrary>(['mal-animelist'])
      if (prev) qc.setQueryData(['mal-animelist'], patchLibrary(prev, malId, { score }))
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['mal-animelist'], ctx.prev) },
  })
}

// ── Add to list ───────────────────────────────────────────────────────────────

export function useAddMALAnime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ malId, status }: { malId: number; status: string }) => {
      const accessToken = await getValidAccessToken()
      return malProxy({
        action: 'api', method: 'PATCH',
        path:   `/anime/${malId}/my_list_status`,
        apiBody: { status },
        accessToken,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mal-animelist'] }),
  })
}

// ── Search ────────────────────────────────────────────────────────────────────

interface MALSearchResponse {
  data: Array<{
    node: {
      id:            number
      title:         string
      main_picture?: { medium?: string }
    }
  }>
}

export function useSearchMAL() {
  return useMutation({
    mutationFn: async ({ title }: { title: string }): Promise<MALSearchResult[]> => {
      const accessToken = await getValidAccessToken()
      const resp = await malProxy<MALSearchResponse>({
        action:      'api',
        method:      'GET',
        path:        `/anime?q=${encodeURIComponent(title)}&limit=10&fields=main_picture`,
        accessToken,
      })
      return (resp.data ?? []).map((item) => ({
        malId:    item.node.id,
        title:    item.node.title,
        imageUrl: item.node.main_picture?.medium ?? null,
      }))
    },
  })
}

// ── MAL links (analysis_item_id → enriched link data) ────────────────────────

export interface MALLinkData {
  malAnimeId:  number
  seriesTitle: string | null
  coverUrl:    string | null
  malScore:    number | null
  genres:      string[]
  releaseYear: number | null
  numEpisodes: number | null
}

export function useMALLinks() {
  return useQuery({
    queryKey: ['mal-links'],
    queryFn:  async (): Promise<Map<number, MALLinkData>> => {
      const { data, error } = await supabase
        .from('mal_links')
        .select('analysis_item_id, mal_anime_id, series_title, cover_url, mal_score, genres, release_year, num_episodes')
      if (error) throw error
      return new Map((data ?? []).map((r) => [
        r.analysis_item_id as number,
        {
          malAnimeId:  r.mal_anime_id  as number,
          seriesTitle: r.series_title  as string | null,
          coverUrl:    r.cover_url     as string | null,
          malScore:    r.mal_score     as number | null,
          genres:      (r.genres       as string[] | null) ?? [],
          releaseYear: r.release_year  as number | null,
          numEpisodes: r.num_episodes  as number | null,
        },
      ]))
    },
    staleTime: 1000 * 60 * 10,
  })
}

export function useUpsertMALLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      analysisItemId,
      malAnimeId,
      seriesTitle,
    }: {
      analysisItemId: number
      malAnimeId:     number
      seriesTitle?:   string
    }) => {
      const { error } = await supabase
        .from('mal_links')
        .upsert({
          analysis_item_id: analysisItemId,
          mal_anime_id:     malAnimeId,
          series_title:     seriesTitle ?? null,
        })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mal-links'] }),
  })
}

export function useDeleteMALLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (analysisItemId: number) => {
      const { error } = await supabase
        .from('mal_links')
        .delete()
        .eq('analysis_item_id', analysisItemId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mal-links'] }),
  })
}
