/**
 * @trove/shared — domain types shared by the web app and the API.
 *
 * Single source of truth: previously duplicated between
 * Trove/src/types/index.ts and Trove-Backend/src/types.ts ("kept in sync by
 * hand"). Both packages now re-export from here.
 */

export type Platform = 'reddit' | 'instagram'

export interface Post {
  post_id: string
  platform: Platform
  url: string | null
  owner: string | null
  owner_fullname: string | null
  title: string | null
  caption: string | null
  subreddit: string | null
  media_type: string | null
  hashtags: string[]
  likes: number | null
  score: number | null
  year: string | null
  location: string | null
  transcription: string | null
  comments: unknown[]
  timestamp: string | null
  created_at: string
  updated_at: string
}

export interface OutputField {
  key: string
  label: string
}

export interface Category {
  id: number
  name: string
  extraction_goal: string | null
  output_fields: OutputField[]
  top_n: number
  trackable: boolean
  group_by: string | string[] | null
  created_at: string
}

/** The subset of a post joined onto an analysis item. */
export interface PostRef {
  url: string | null
  year: string | null
  timestamp: string | null
  caption: string | null
  owner: string | null
  owner_fullname: string | null
  platform: Platform | null
}

export interface AnalysisItem {
  id: number
  category_name: string
  platform: Platform
  item_data: Record<string, unknown>
  source_post_id: string | null
  created_at: string
  posts: PostRef | null
}

export interface AnalysisMetadata {
  category_name: string
  platform: Platform
  post_count: number | null
  analyzed_at: string
}

/** Camel-cased recipe card (matches the recipe_cards table, mapped). */
export interface RecipeCard {
  ingredients: string[]
  steps: string[]
  prepTime: string | null
  cookTime: string | null
  totalTime: string | null
  servings: string | null
  notes: string | null
  sourceExcerpt: string | null
  enrichedBy: string | null
}

/** Back-compat alias for the frontend's original name. */
export type RecipeCardData = RecipeCard

/** Response payload for GET /api/recipes/:postId */
export interface RecipeResponse {
  item: AnalysisItem
  card: RecipeCard | null
}

// ── Enrichment-link value types ────────────────────────────────────────────────
// These are the Map *values* for the per-table enrichment reads. The matching
// API endpoints return arrays of (value & key); the frontend hooks build Maps.

export interface BGGLinkData {
  bggGameId: number
  gameTitle: string | null
  coverUrl: string | null
  thumbnailUrl: string | null
  bggRating: number | null // community rating out of 10
  bggWeight: number | null // complexity 1–5
  yearPublished: number | null
  minPlayers: number | null
  maxPlayers: number | null
  playingTime: number | null
  categories: string[]
  mechanics: string[]
}

export interface TMDBLink {
  tmdbId: number
  tmdbTitle: string | null
  mediaType: 'movie' | 'tv'
  personalScore: number | null // 1–10, null = unrated
  posterUrl: string | null
  tmdbRating: number | null
  genres: string[]
  releaseYear: number | null
}

export interface IGDBLink {
  igdbGameId: number
  igdbTitle: string | null
  personalScore: number | null // 1–10, null = unrated
  coverUrl: string | null
  igdbRating: number | null
  genres: string[]
  platforms: string[]
  releaseYear: number | null
}

export interface SpotifyLink {
  trackId: string | null
  trackUrl: string | null
  trackName: string | null
  artistName: string | null
  albumName: string | null
  albumArtUrl: string | null
  previewUrl: string | null
  popularity: number | null
}

export interface MALLinkData {
  malAnimeId: number
  seriesTitle: string | null
  coverUrl: string | null
  malScore: number | null
  genres: string[]
  releaseYear: number | null
  numEpisodes: number | null
}

export interface HardcoverLinkData {
  hardcoverBookId: number
  coverUrl: string | null
  hcCommunityRating: number | null
  genres: string[]
  releaseYear: number | null
}

export interface TravelLocation {
  lat: number
  lng: number
  label: string
  type: string // 'poi' | 'city_fallback' | 'address' | etc.
}

/** Lean post shape for the "surface every saved post" link-out cards. */
export interface CategoryPost {
  post_id: string
  platform: Platform
  url: string | null
  title: string | null
  caption: string | null
  owner: string | null
  owner_fullname: string | null
  media_type: string | null
  timestamp: string | null
}
