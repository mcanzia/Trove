import { Hono } from 'hono'
import { supabase } from '../lib/supabase.js'
import type {
  BGGLinkData,
  TMDBLink,
  IGDBLink,
  MALLinkData,
  HardcoverLinkData,
  TravelLocation,
} from '@trove/shared'

/**
 * Enrichment-table reads — one endpoint per *_links / lookup table. Each returns
 * a flat array of (value & key); the frontend hooks build their Maps from it.
 *
 * Migrated from the read queries in useBGGLinks / useTMDB / useIGDB / useMAL /
 * useHardcoverBooks / useInstagramStorefronts / useTravelLocations. The write
 * mutations and external API/OAuth proxies in those files are intentionally NOT
 * migrated here.
 */

type Row = Record<string, unknown>

/** Select all rows of a table; throws on error (caught per-route below). */
async function selectAll(table: string, columns: string): Promise<Row[]> {
  const { data, error } = await supabase.from(table).select(columns)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Row[]
}

const fail = (msg: string) => ({ error: msg })

export const enrichments = new Hono()
  .get('/bgg', async (c) => {
    try {
      const rows = await selectAll(
        'bgg_links',
        'analysis_item_id, bgg_game_id, game_title, cover_url, thumbnail_url, bgg_rating, bgg_weight, year_published, min_players, max_players, playing_time, categories, mechanics',
      )
      const result: (BGGLinkData & { analysisItemId: number })[] = rows.map((r) => ({
        analysisItemId: r.analysis_item_id as number,
        bggGameId: r.bgg_game_id as number,
        gameTitle: (r.game_title as string | null) ?? null,
        coverUrl: (r.cover_url as string | null) ?? null,
        thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
        bggRating: (r.bgg_rating as number | null) ?? null,
        bggWeight: (r.bgg_weight as number | null) ?? null,
        yearPublished: (r.year_published as number | null) ?? null,
        minPlayers: (r.min_players as number | null) ?? null,
        maxPlayers: (r.max_players as number | null) ?? null,
        playingTime: (r.playing_time as number | null) ?? null,
        categories: (r.categories as string[] | null) ?? [],
        mechanics: (r.mechanics as string[] | null) ?? [],
      }))
      return c.json(result)
    } catch (e) {
      return c.json(fail((e as Error).message), 500)
    }
  })
  .get('/tmdb', async (c) => {
    try {
      const rows = await selectAll(
        'tmdb_links',
        'analysis_item_id, tmdb_id, media_type, tmdb_title, personal_score, poster_url, tmdb_rating, genres, release_year',
      )
      const result: (TMDBLink & { analysisItemId: number })[] = rows.map((r) => ({
        analysisItemId: r.analysis_item_id as number,
        tmdbId: r.tmdb_id as number,
        tmdbTitle: (r.tmdb_title as string | null) ?? null,
        mediaType: r.media_type as 'movie' | 'tv',
        personalScore: (r.personal_score as number | null) ?? null,
        posterUrl: (r.poster_url as string | null) ?? null,
        tmdbRating: (r.tmdb_rating as number | null) ?? null,
        genres: (r.genres as string[] | null) ?? [],
        releaseYear: (r.release_year as number | null) ?? null,
      }))
      return c.json(result)
    } catch (e) {
      return c.json(fail((e as Error).message), 500)
    }
  })
  .get('/igdb', async (c) => {
    try {
      const rows = await selectAll(
        'igdb_links',
        'analysis_item_id, igdb_game_id, game_title, personal_score, cover_url, igdb_rating, genres, platforms, release_year',
      )
      const result: (IGDBLink & { analysisItemId: number })[] = rows.map((r) => ({
        analysisItemId: r.analysis_item_id as number,
        igdbGameId: r.igdb_game_id as number,
        igdbTitle: (r.game_title as string | null) ?? null,
        personalScore: (r.personal_score as number | null) ?? null,
        coverUrl: (r.cover_url as string | null) ?? null,
        igdbRating: (r.igdb_rating as number | null) ?? null,
        genres: (r.genres as string[] | null) ?? [],
        platforms: (r.platforms as string[] | null) ?? [],
        releaseYear: (r.release_year as number | null) ?? null,
      }))
      return c.json(result)
    } catch (e) {
      return c.json(fail((e as Error).message), 500)
    }
  })
  .get('/mal', async (c) => {
    try {
      const rows = await selectAll(
        'mal_links',
        'analysis_item_id, mal_anime_id, series_title, cover_url, mal_score, genres, release_year, num_episodes',
      )
      const result: (MALLinkData & { analysisItemId: number })[] = rows.map((r) => ({
        analysisItemId: r.analysis_item_id as number,
        malAnimeId: r.mal_anime_id as number,
        seriesTitle: (r.series_title as string | null) ?? null,
        coverUrl: (r.cover_url as string | null) ?? null,
        malScore: (r.mal_score as number | null) ?? null,
        genres: (r.genres as string[] | null) ?? [],
        releaseYear: (r.release_year as number | null) ?? null,
        numEpisodes: (r.num_episodes as number | null) ?? null,
      }))
      return c.json(result)
    } catch (e) {
      return c.json(fail((e as Error).message), 500)
    }
  })
  .get('/hardcover', async (c) => {
    try {
      const rows = await selectAll(
        'hardcover_links',
        'analysis_item_id, hardcover_book_id, cover_url, hc_community_rating, genres, release_year',
      )
      const result: (HardcoverLinkData & { analysisItemId: number })[] = rows.map((r) => ({
        analysisItemId: r.analysis_item_id as number,
        hardcoverBookId: r.hardcover_book_id as number,
        coverUrl: (r.cover_url as string | null) ?? null,
        hcCommunityRating: (r.hc_community_rating as number | null) ?? null,
        genres: (r.genres as string[] | null) ?? [],
        releaseYear: (r.release_year as number | null) ?? null,
      }))
      return c.json(result)
    } catch (e) {
      return c.json(fail((e as Error).message), 500)
    }
  })
  .get('/instagram-storefronts', async (c) => {
    try {
      const rows = await selectAll('instagram_storefronts', 'owner, storefront_url')
      const result: { owner: string; storefrontUrl: string }[] = rows.map((r) => ({
        owner: r.owner as string,
        storefrontUrl: r.storefront_url as string,
      }))
      return c.json(result)
    } catch (e) {
      return c.json(fail((e as Error).message), 500)
    }
  })
  .get('/travel-locations', async (c) => {
    try {
      const rows = await selectAll(
        'travel_locations',
        'analysis_item_id, lat, lng, label, type',
      )
      const result: (TravelLocation & { analysisItemId: number })[] = rows.map((r) => ({
        analysisItemId: r.analysis_item_id as number,
        lat: r.lat as number,
        lng: r.lng as number,
        label: r.label as string,
        type: r.type as string,
      }))
      return c.json(result)
    } catch (e) {
      return c.json(fail((e as Error).message), 500)
    }
  })
