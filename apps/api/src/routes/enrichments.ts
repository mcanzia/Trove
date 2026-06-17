import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppEnv } from '../lib/context.js'
import type {
  BGGLinkData,
  TMDBLink,
  IGDBLink,
  MALLinkData,
  HardcoverLinkData,
  TravelLocation,
  SpotifyLink,
} from '@trove/shared'

/**
 * Enrichment-table reads — one endpoint per *_links / lookup table. Each returns
 * a flat array of (value & key); the frontend hooks build their Maps from it.
 *
 * All queries (reads AND writes) run on the per-request user client from the
 * auth middleware, so RLS scopes every row to the requesting user. Writes also
 * stamp user_id (required by the RLS with-check policy on insert).
 */

type Row = Record<string, unknown>

/** Select all rows of a table on the caller's client; throws on error. */
async function selectAll(sb: SupabaseClient, table: string, columns: string): Promise<Row[]> {
  const { data, error } = await sb.from(table).select(columns)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Row[]
}

const fail = (msg: string) => ({ error: msg })
const ok = () => ({ ok: true as const })

// Shared validators for the write endpoints.
const idParam = z.object({ analysisItemId: z.coerce.number().int() })
const scoreBody = z.object({ personalScore: z.number().nullable() })

const tmdbUpsertBody = z.object({
  tmdbId: z.number(),
  mediaType: z.enum(['movie', 'tv']),
  tmdbTitle: z.string().nullish(),
  posterUrl: z.string().nullish(),
  tmdbRating: z.number().nullish(),
  genres: z.array(z.string()).optional(),
  releaseYear: z.number().nullish(),
})

const igdbUpsertBody = z.object({
  igdbGameId: z.number(),
  gameTitle: z.string().nullish(),
  coverUrl: z.string().nullish(),
  igdbRating: z.number().nullish(),
  genres: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
  releaseYear: z.number().nullish(),
})

const malUpsertBody = z.object({
  malAnimeId: z.number(),
  seriesTitle: z.string().nullish(),
})

const hardcoverUpsertBody = z.object({
  hardcoverBookId: z.number(),
  bookTitle: z.string().nullish(),
  coverUrl: z.string().nullish(),
  hcCommunityRating: z.number().nullish(),
  genres: z.array(z.string()).optional(),
  releaseYear: z.number().nullish(),
})

export const enrichments = new Hono<AppEnv>()
  .get('/bgg', async (c) => {
    try {
      const rows = await selectAll(
        c.get('supabase'),
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
        c.get('supabase'),
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
  .get('/spotify', async (c) => {
    try {
      const rows = await selectAll(
        c.get('supabase'),
        'spotify_links',
        'analysis_item_id, track_id, track_url, track_name, artist_name, album_name, album_art_url, preview_url, popularity',
      )
      const result: (SpotifyLink & { analysisItemId: number })[] = rows.map((r) => ({
        analysisItemId: r.analysis_item_id as number,
        trackId: (r.track_id as string | null) ?? null,
        trackUrl: (r.track_url as string | null) ?? null,
        trackName: (r.track_name as string | null) ?? null,
        artistName: (r.artist_name as string | null) ?? null,
        albumName: (r.album_name as string | null) ?? null,
        albumArtUrl: (r.album_art_url as string | null) ?? null,
        previewUrl: (r.preview_url as string | null) ?? null,
        popularity: (r.popularity as number | null) ?? null,
      }))
      return c.json(result)
    } catch (e) {
      return c.json(fail((e as Error).message), 500)
    }
  })
  .get('/igdb', async (c) => {
    try {
      const rows = await selectAll(
        c.get('supabase'),
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
        c.get('supabase'),
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
        c.get('supabase'),
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
      const rows = await selectAll(c.get('supabase'), 'instagram_storefronts', 'owner, storefront_url')
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
        c.get('supabase'),
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

  // ── Writes (run under the caller's JWT; owner-scoped RLS confines each row to
  //    its owner, so a delete/update can only touch the caller's own links) ──────

  // BGG — delete only (links are created by the Python sync).
  .delete('/bgg/:analysisItemId', zValidator('param', idParam), async (c) => {
    const { analysisItemId } = c.req.valid('param')
    try {
      const { error } = await c.get('supabase')
        .from('bgg_links')
        .delete()
        .eq('analysis_item_id', analysisItemId)
      if (error) return c.json(fail(error.message), 500)
      return c.json(ok())
    } catch (e) {
      return c.json(fail((e as Error).message), 500)
    }
  })

  // TMDB — upsert / delete / set personal score.
  .put(
    '/tmdb/:analysisItemId',
    zValidator('param', idParam),
    zValidator('json', tmdbUpsertBody),
    async (c) => {
      const { analysisItemId } = c.req.valid('param')
      const b = c.req.valid('json')
      try {
        const { error } = await c.get('supabase').from('tmdb_links').upsert({
          analysis_item_id: analysisItemId,
          user_id: c.get('userId'),
          tmdb_id: b.tmdbId,
          media_type: b.mediaType,
          tmdb_title: b.tmdbTitle ?? null,
          poster_url: b.posterUrl ?? null,
          tmdb_rating: b.tmdbRating ?? null,
          genres: b.genres ?? [],
          release_year: b.releaseYear ?? null,
        })
        if (error) return c.json(fail(error.message), 500)
        return c.json(ok())
      } catch (e) {
        return c.json(fail((e as Error).message), 500)
      }
    },
  )
  .delete('/tmdb/:analysisItemId', zValidator('param', idParam), async (c) => {
    const { analysisItemId } = c.req.valid('param')
    try {
      const { error } = await c.get('supabase')
        .from('tmdb_links')
        .delete()
        .eq('analysis_item_id', analysisItemId)
      if (error) return c.json(fail(error.message), 500)
      return c.json(ok())
    } catch (e) {
      return c.json(fail((e as Error).message), 500)
    }
  })
  .patch(
    '/tmdb/:analysisItemId/score',
    zValidator('param', idParam),
    zValidator('json', scoreBody),
    async (c) => {
      const { analysisItemId } = c.req.valid('param')
      const { personalScore } = c.req.valid('json')
      try {
        const { error } = await c.get('supabase')
          .from('tmdb_links')
          .update({ personal_score: personalScore })
          .eq('analysis_item_id', analysisItemId)
        if (error) return c.json(fail(error.message), 500)
        return c.json(ok())
      } catch (e) {
        return c.json(fail((e as Error).message), 500)
      }
    },
  )

  // IGDB — upsert / delete / set personal score.
  .put(
    '/igdb/:analysisItemId',
    zValidator('param', idParam),
    zValidator('json', igdbUpsertBody),
    async (c) => {
      const { analysisItemId } = c.req.valid('param')
      const b = c.req.valid('json')
      try {
        const { error } = await c.get('supabase').from('igdb_links').upsert({
          analysis_item_id: analysisItemId,
          user_id: c.get('userId'),
          igdb_game_id: b.igdbGameId,
          game_title: b.gameTitle ?? null,
          cover_url: b.coverUrl ?? null,
          igdb_rating: b.igdbRating ?? null,
          genres: b.genres ?? [],
          platforms: b.platforms ?? [],
          release_year: b.releaseYear ?? null,
        })
        if (error) return c.json(fail(error.message), 500)
        return c.json(ok())
      } catch (e) {
        return c.json(fail((e as Error).message), 500)
      }
    },
  )
  .delete('/igdb/:analysisItemId', zValidator('param', idParam), async (c) => {
    const { analysisItemId } = c.req.valid('param')
    try {
      const { error } = await c.get('supabase')
        .from('igdb_links')
        .delete()
        .eq('analysis_item_id', analysisItemId)
      if (error) return c.json(fail(error.message), 500)
      return c.json(ok())
    } catch (e) {
      return c.json(fail((e as Error).message), 500)
    }
  })
  .patch(
    '/igdb/:analysisItemId/score',
    zValidator('param', idParam),
    zValidator('json', scoreBody),
    async (c) => {
      const { analysisItemId } = c.req.valid('param')
      const { personalScore } = c.req.valid('json')
      try {
        const { error } = await c.get('supabase')
          .from('igdb_links')
          .update({ personal_score: personalScore })
          .eq('analysis_item_id', analysisItemId)
        if (error) return c.json(fail(error.message), 500)
        return c.json(ok())
      } catch (e) {
        return c.json(fail((e as Error).message), 500)
      }
    },
  )

  // MAL — upsert / delete.
  .put(
    '/mal/:analysisItemId',
    zValidator('param', idParam),
    zValidator('json', malUpsertBody),
    async (c) => {
      const { analysisItemId } = c.req.valid('param')
      const b = c.req.valid('json')
      try {
        const { error } = await c.get('supabase').from('mal_links').upsert({
          analysis_item_id: analysisItemId,
          user_id: c.get('userId'),
          mal_anime_id: b.malAnimeId,
          series_title: b.seriesTitle ?? null,
        })
        if (error) return c.json(fail(error.message), 500)
        return c.json(ok())
      } catch (e) {
        return c.json(fail((e as Error).message), 500)
      }
    },
  )
  .delete('/mal/:analysisItemId', zValidator('param', idParam), async (c) => {
    const { analysisItemId } = c.req.valid('param')
    try {
      const { error } = await c.get('supabase')
        .from('mal_links')
        .delete()
        .eq('analysis_item_id', analysisItemId)
      if (error) return c.json(fail(error.message), 500)
      return c.json(ok())
    } catch (e) {
      return c.json(fail((e as Error).message), 500)
    }
  })

  // Hardcover — upsert / delete.
  .put(
    '/hardcover/:analysisItemId',
    zValidator('param', idParam),
    zValidator('json', hardcoverUpsertBody),
    async (c) => {
      const { analysisItemId } = c.req.valid('param')
      const b = c.req.valid('json')
      try {
        const { error } = await c.get('supabase').from('hardcover_links').upsert({
          analysis_item_id: analysisItemId,
          user_id: c.get('userId'),
          hardcover_book_id: b.hardcoverBookId,
          book_title: b.bookTitle ?? null,
          cover_url: b.coverUrl ?? null,
          hc_community_rating: b.hcCommunityRating ?? null,
          genres: b.genres ?? [],
          release_year: b.releaseYear ?? null,
        })
        if (error) return c.json(fail(error.message), 500)
        return c.json(ok())
      } catch (e) {
        return c.json(fail((e as Error).message), 500)
      }
    },
  )
  .delete('/hardcover/:analysisItemId', zValidator('param', idParam), async (c) => {
    const { analysisItemId } = c.req.valid('param')
    try {
      const { error } = await c.get('supabase')
        .from('hardcover_links')
        .delete()
        .eq('analysis_item_id', analysisItemId)
      if (error) return c.json(fail(error.message), 500)
      return c.json(ok())
    } catch (e) {
      return c.json(fail((e as Error).message), 500)
    }
  })
