import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useState, useMemo, useRef, useCallback, useEffect, lazy, Suspense } from 'react'
import { toSlug } from '@/lib/utils'
import { type ColumnDef } from '@tanstack/react-table'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

import { ChevronDown, MapPin, Table2, Map as MapIcon, Search, Play } from 'lucide-react'
import { getCategoryTheme } from '@/lib/categoryConfig'
import { pushRecent } from '@/lib/recents'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnalysisItems } from '@/hooks/useAnalysisItems'
import { useCategories } from '@/hooks/useCategories'
import { useTravelLocations } from '@/hooks/useTravelLocations'
import { DataTable } from '@/components/DataTable'
import { getLanguageFlag } from '@/lib/languageFlags'
import { getCountryFlag } from '@/lib/countryFlags'
import {
  useHardcoverBooks,
  useHardcoverLinks,
  useUpsertHardcoverLink,
  useUpdateHardcoverRating,
  useUpdateHardcoverStatus,
  useSearchHardcoverBook,
  useAddBookByTitle,
  findHardcoverBook,
  type HardcoverSearchResult,
  type HardcoverLinkData,
} from '@/hooks/useHardcoverBooks'
import { HardcoverSearchModal } from '@/components/HardcoverSearchModal'
import { BookCard } from '@/components/BookCard'
import { MALSearchModal } from '@/components/MALSearchModal'
import { IGDBSearchModal } from '@/components/IGDBSearchModal'
import { TMDBSearchModal } from '@/components/TMDBSearchModal'
import {
  useIGDBLinks,
  useUpsertIGDBLink,
  useDeleteIGDBLink,
  useUpdateIGDBScore,
  useSearchIGDB,
  type IGDBGame,
} from '@/hooks/useIGDB'
import {
  useTMDBLinks,
  useUpsertTMDBLink,
  useDeleteTMDBLink,
  useUpdateTMDBScore,
  useSearchTMDB,
  type TMDBTitle,
  type TMDBLink,
} from '@/hooks/useTMDB'
import {
  useMALAuth,
  useMALAnimeList,
  useMALLinks,
  useUpsertMALLink,
  useDeleteMALLink,
  useUpdateMALStatus,
  useUpdateMALScore,
  useAddMALAnime,
  useSearchMAL,
  normaliseAnimeTitle,
  MAL_STATUS,
  type MALSearchResult,
} from '@/hooks/useMAL'
import { useBGGLinks } from '@/hooks/useBGGLinks'
import { useRecipeCards } from '@/hooks/useRecipeCards'
import { useInstagramStorefronts } from '@/hooks/useInstagramStorefronts'
import { SavedPostsSection } from '@/components/SavedPostsSection'
import type { AnalysisItem, OutputField, Platform } from '@/types'
import type { FlyTarget } from '@/components/TravelMap'

const TravelMap = lazy(() => import('@/components/TravelMap'))

// ── column builder ────────────────────────────────────────────────────────────

function buildColumns(
  fields: OutputField[],
  hiddenKeys: string[] = [],
  onLocationClick?: (lat: number, lng: number, itemId: number) => void,
  locationsMap?: Map<number, { lat: number; lng: number; label: string; type: string }[]> | null,
): ColumnDef<AnalysisItem, unknown>[] {
  const dynamic: ColumnDef<AnalysisItem, unknown>[] = fields
    .filter((f) => !hiddenKeys.includes(f.key))
    .map((f, i) => ({
      id: f.key,
      header: f.label,
      accessorFn: (row) => row.item_data[f.key] ?? '',
      cell: ({ getValue }) => (
        <span className={i === 0 ? 'font-medium text-foreground' : 'text-foreground'}>
          {String(getValue() ?? '')}
        </span>
      ),
    }))

  return [
    {
      id: '_index',
      header: '#',
      cell: ({ row }) => (
        <span className="text-muted-foreground tabular-nums">{row.index + 1}</span>
      ),
      enableSorting: false,
      size: 48,
    },
    ...dynamic,
    {
      id: '_added',
      header: 'Added',
      accessorFn: (row) =>
        row.item_data._first_added
          ? String(row.item_data._first_added).slice(0, 10)
          : row.created_at.slice(0, 10),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground whitespace-nowrap tabular-nums">
          {String(getValue())}
        </span>
      ),
    },
    {
      id: '_posted',
      header: 'Posted',
      accessorFn: (row) =>
        row.platform === 'instagram'
          ? (row.posts?.timestamp?.slice(0, 10) ?? '')
          : (row.posts?.year ?? ''),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground whitespace-nowrap tabular-nums">
          {String(getValue()) || '—'}
        </span>
      ),
    },
    {
      id: '_platform',
      header: 'Platform',
      accessorFn: (row) => row.platform,
      cell: ({ getValue }) => {
        const p = getValue() as string
        return (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            p === 'reddit'
              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
              : 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'
          }`}>
            {p}
          </span>
        )
      },
    },
    ...(onLocationClick ? [{
      id: '_location',
      header: 'Location',
      accessorFn: (row: AnalysisItem) => {
        const locs = locationsMap
          ? (locationsMap.get(row.id) ?? [])
          : (row.item_data._locations as { lat: number; lng: number }[] | undefined) ?? []
        if (!locs.length) return ''
        return `${locs[0].lat},${locs[0].lng}`
      },
      cell: ({ row, getValue }: { row: { original: AnalysisItem }, getValue: () => unknown }) => {
        const coords = getValue() as string
        if (!coords) return <span className="text-muted-foreground text-xs">—</span>
        const [lat, lng] = coords.split(',')
        return (
          <button
            onClick={() => onLocationClick(parseFloat(lat), parseFloat(lng), row.original.id)}
            className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline whitespace-nowrap cursor-pointer"
          >
            <MapPin size={11} />
            {parseFloat(lat).toFixed(4)}, {parseFloat(lng).toFixed(4)}
          </button>
        )
      },
      enableSorting: false,
    } satisfies ColumnDef<AnalysisItem, unknown>] : []),
    {
      id: '_source',
      header: 'Source',
      accessorFn: (row) => row.posts?.url ?? '',
      cell: ({ row, getValue }) => {
        const url = getValue() as string
        if (!url) return <span className="text-muted-foreground text-xs">—</span>
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline text-xs whitespace-nowrap"
          >
            {row.original.platform === 'reddit' ? 'Reddit →' : 'Instagram →'}
          </a>
        )
      },
      enableSorting: false,
    },
  ]
}

// ── sub-components ────────────────────────────────────────────────────────────

interface CityTableProps {
  city: string
  items: AnalysisItem[]
  columns: ColumnDef<AnalysisItem, unknown>[]
  search: string
}

function CityTable({ city, items, columns, search }: CityTableProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <MapPin size={15} className="text-gold shrink-0" />
        <h2 className="text-base font-semibold text-foreground">{city}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {items.length} tip{items.length !== 1 ? 's' : ''}
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>
      <DataTable columns={columns} data={items} globalFilter={search} />
    </section>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

// Product categories that get a Shop link column
const PRODUCT_CATEGORIES: Record<string, { nameField: string; fallback: 'amazon' | 'google' }> = {
  'Home & Kitchen Products':   { nameField: 'product_name',    fallback: 'amazon' },
  'Skincare & Acne Treatment': { nameField: 'product_routine', fallback: 'amazon' },
  'Fashion & Beauty':          { nameField: 'product_routine', fallback: 'amazon' },
  'Tech & Gadgets':            { nameField: 'name',            fallback: 'google' },
}

// Non-social-media URL regex (strips Instagram/Reddit/Redd.it)
const EXTERNAL_URL_RE = /https?:\/\/(?!(?:www\.)?(?:instagram\.com|reddit\.com|redd\.it))[^\s)"'<>]+/

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>()
  // Match the slug back to the real category name via the same toSlug transform
  const { data: categories } = useCategories()
  const category = categories?.find((c) => toSlug(c.name) === slug)
  const categoryName = category?.name ?? slug ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Derive controlled state from URL search params so the page is
  // fully shareable/bookmarkable and survives a browser refresh.
  const platformParam = searchParams.get('platform')
  const platform = (platformParam === 'reddit' || platformParam === 'instagram')
    ? platformParam as Platform
    : undefined
  const viewMode   = (searchParams.get('view') === 'map') ? 'map' as const : 'table' as const
  const selectedGroup = searchParams.get('group') ?? ''

  /** Update a single search param, preserving the rest. */
  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value != null) next.set(key, value)
          else next.delete(key)
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const { data: items, isLoading, error } = useAnalysisItems({ categoryName, platform })

  // Post IDs that produced an extracted item — used to find classified posts
  // with no highlight, which surface as link-out cards (nothing saved is hidden).
  const surfacedPostIds = useMemo(
    () => new Set((items ?? []).map((i) => i.source_post_id).filter((x): x is string => !!x)),
    [items],
  )

  // Platform mix for the hero meta line (computed from loaded items).
  const platformMix = useMemo(() => {
    const list = items ?? []
    let reddit = 0
    let instagram = 0
    for (const i of list) {
      if (i.platform === 'reddit') reddit++
      else if (i.platform === 'instagram') instagram++
    }
    return { total: list.length, reddit, instagram }
  }, [items])

  // Record the visited category into recents for the command palette.
  useEffect(() => {
    if (category?.name) pushRecent(category.name)
  }, [category?.name])

  // Press "/" anywhere to focus the table search (ignore when typing in a field).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      e.preventDefault()
      searchInputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const { data: travelLocations } = useTravelLocations()

  const groupBy = category?.group_by

  // ── single-level grouping (e.g. "language") ──
  const singleGroupField = typeof groupBy === 'string' ? groupBy : null

  // ── two-level grouping (e.g. ["country", "city"]) ──
  const isHierarchical = Array.isArray(groupBy) && groupBy.length === 2
  const [hierarchyKey1, hierarchyKey2] = isHierarchical
    ? (groupBy as [string, string])
    : [null, null]

  // Sorted unique values for level-1 dropdown
  const level1Options = useMemo(() => {
    if (!items) return []
    const field = singleGroupField ?? hierarchyKey1
    if (!field) return []
    const values = new Set<string>()
    for (const item of items) {
      const v = String(item.item_data[field] ?? '').trim()
      if (v) values.add(v)
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [items, singleGroupField, hierarchyKey1])

  const activeGroup = selectedGroup || level1Options[0] || ''

  // ── items filtered to selected level-1 value ──
  const level1Items = useMemo(() => {
    if (!items) return []
    const field = singleGroupField ?? hierarchyKey1
    if (!field || !activeGroup) return items
    return items.filter(
      (item) => String(item.item_data[field] ?? '').trim() === activeGroup,
    )
  }, [items, singleGroupField, hierarchyKey1, activeGroup])

  // ── for hierarchical: group level-1 items by level-2 (city) ──
  const cityGroups = useMemo(() => {
    if (!isHierarchical || !hierarchyKey2) return null
    const map = new Map<string, AnalysisItem[]>()
    for (const item of level1Items) {
      const city = String(item.item_data[hierarchyKey2] ?? 'Unknown').trim()
      if (!map.has(city)) map.set(city, [])
      map.get(city)!.push(item)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [isHierarchical, hierarchyKey2, level1Items])

  // ── columns: hide group-by keys (shown in header/dropdown instead) ──
  const hiddenKeys = useMemo(() => {
    if (singleGroupField) return [singleGroupField]
    if (isHierarchical && hierarchyKey1 && hierarchyKey2) return [hierarchyKey1, hierarchyKey2]
    return []
  }, [singleGroupField, isHierarchical, hierarchyKey1, hierarchyKey2])

  const handleLocationClick = useMemo(() => {
    if (!isHierarchical) return undefined
    return (lat: number, lng: number, itemId?: number) => {
      setFlyTarget((prev) => ({ lat, lng, key: (prev?.key ?? 0) + 1, itemId }))
      setParam('view', 'map')
    }
  }, [isHierarchical, setParam])

  const qc      = useQueryClient()
  const isBooks       = categoryName === 'Books Worth Reading'
  const isMtg         = categoryName === 'Magic: The Gathering'
  const isBoardGames  = categoryName === 'Board Games'
  const isAnime       = categoryName === 'Anime & Manga'
  const isVideoGames  = categoryName === 'Video Game Recommendations'
  const isFood        = categoryName === 'Food & Cooking'
  const isMovies      = categoryName === 'Movies & Film Recommendations'
  const isMusic       = categoryName === 'Music Recommendations'
  const isTVSeries    = categoryName === 'TV Series Recommendations'
  const isTMDB        = isMovies || isTVSeries
  const tmdbMediaType = isTVSeries ? 'tv' : 'movie'

  const productConfig = PRODUCT_CATEGORIES[categoryName] ?? null
  const { data: storefronts } = useInstagramStorefronts()

  /** Resolve the best shop link for a product item. Priority:
   *  1. Post URL if external (not Instagram/Reddit)
   *  2. First external URL found in the post caption
   *  3. Amazon storefront for the posting account (if verified)
   *  4. Amazon search (physical) or Google search (software/mixed)
   */
  const getShopLink = useCallback((item: AnalysisItem): { url: string; label: string } | null => {
    if (!productConfig) return null

    // 1. External post URL
    const postUrl = item.posts?.url ?? ''
    if (postUrl && EXTERNAL_URL_RE.test(postUrl)) {
      return { url: postUrl, label: 'View →' }
    }
    // 2. URL in caption
    const caption = item.posts?.caption ?? ''
    const captionMatch = caption.match(EXTERNAL_URL_RE)
    if (captionMatch) {
      return { url: captionMatch[0], label: 'Link →' }
    }

    const productName = String(item.item_data[productConfig.nameField] ?? '').trim()
    if (!productName) return null

    // 3. Amazon storefront for the posting account
    const owner = item.posts?.owner ?? ''
    const storefrontUrl = owner ? storefronts?.get(owner) : undefined
    if (storefrontUrl) {
      return { url: storefrontUrl, label: 'Storefront →' }
    }

    // 4. Search fallback
    if (productConfig.fallback === 'amazon') {
      return {
        url: `https://www.amazon.com/s?k=${encodeURIComponent(productName)}`,
        label: 'Amazon →',
      }
    }
    // 'google' fallback: check Tech type — skip Amazon for pure software
    const itemType = String(item.item_data.type ?? '').toLowerCase()
    const isSoftware = ['software', 'app', 'ai', 'platform', 'service', 'tool', 'extension', 'plugin'].some(t => itemType.includes(t))
    if (isSoftware) {
      return {
        url: `https://www.google.com/search?q=${encodeURIComponent(productName)}`,
        label: 'Search →',
      }
    }
    return {
      url: `https://www.amazon.com/s?k=${encodeURIComponent(productName)}`,
      label: 'Amazon →',
    }
  }, [productConfig, storefronts])
  const { data: bggLinks }          = useBGGLinks()
  const { data: recipeCards }       = useRecipeCards()
  const { data: hardcoverLibrary }  = useHardcoverBooks()
  const { data: hardcoverLinks }    = useHardcoverLinks()
  const updateRating    = useUpdateHardcoverRating()
  const updateStatus    = useUpdateHardcoverStatus()
  const searchBook      = useSearchHardcoverBook()
  const addBook         = useAddBookByTitle()
  const upsertLink      = useUpsertHardcoverLink()

  // NOTE: Stale link cleanup removed — hardcover_links now stores backend-synced
  // enrichment (cover art, rating, genres) for all books, not just personally-tracked
  // ones. Deleting rows for books absent from the personal library would wipe that
  // enrichment data. Individual rows can still be unlinked via the row-level ↺ button.
  // ── MAL integration (Anime & Manga only) ────────────────────────────────────
  const malAuth               = useMALAuth()
  const { data: malLibrary }  = useMALAnimeList()
  const { data: malLinks }    = useMALLinks()
  const updateMALStatus       = useUpdateMALStatus()
  const updateMALScore        = useUpdateMALScore()
  const addMALAnime           = useAddMALAnime()
  const searchMAL             = useSearchMAL()
  const upsertMALLink         = useUpsertMALLink()
  const deleteMALLink         = useDeleteMALLink()

  // Note: we intentionally do NOT auto-delete mal_links when an anime isn't in
  // the user's personal library. mal_links stores backend-synced enrichment data
  // (cover art, community score, genres) for ALL anime items regardless of
  // personal tracking status. Users remove links explicitly via the ✕ button.

  // Auto-sync: title-match unlinked Trove entries against existing MAL library.
  const runMALSync = useCallback(() => {
    if (!items || !malLibrary || !malLinks) return
    const pending: Promise<unknown>[] = []
    for (const item of items) {
      const title = String(item.item_data.series_title ?? '')
      if (!title || malLinks.has(item.id)) continue
      // Auto-sync uses exact normalised title only — no substring fallback to avoid false positives.
      const entry = malLibrary.byTitle.get(normaliseAnimeTitle(title))
      if (entry) {
        pending.push(
          new Promise<void>((resolve) =>
            upsertMALLink.mutate(
              { analysisItemId: item.id, malAnimeId: entry.malId, seriesTitle: entry.title },
              { onSettled: () => resolve() },
            )
          )
        )
      }
    }
    Promise.all(pending)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, malLibrary, malLinks])

  // Auto-sync personal list when the MAL library first loads after connecting.
  useEffect(() => {
    if (isAnime && malLibrary) runMALSync()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [malLibrary])

  const [malAddingItemId, setMalAddingItemId]     = useState<number | null>(null)
  const [malUpdatingId,   setMalUpdatingId]       = useState<number | null>(null)
  const [malModalContext, setMalModalContext]      = useState<{ title: string; itemId: number } | null>(null)
  const [malModalResults, setMalModalResults]     = useState<MALSearchResult[]>([])
  const [malModalSearching, setMalModalSearching] = useState(false)

  // Inline confirmation state for disconnect action
  const [malConfirming, setMalConfirming] = useState<'disconnect' | null>(null)

  // ── IGDB integration (Video Games only) ─────────────────────────────────────
  const { data: igdbLinks }   = useIGDBLinks()
  const upsertIGDBLink        = useUpsertIGDBLink()
  const deleteIGDBLink        = useDeleteIGDBLink()
  const updateIGDBScore       = useUpdateIGDBScore()
  const searchIGDB            = useSearchIGDB()

  const [igdbModalContext,   setIgdbModalContext]   = useState<{ title: string; itemId: number } | null>(null)
  const [igdbModalResults,   setIgdbModalResults]   = useState<IGDBGame[]>([])
  const [igdbModalSearching, setIgdbModalSearching] = useState(false)

  const openIGDBModal = useCallback((title: string, itemId: number) => {
    setIgdbModalContext({ title, itemId })
    setIgdbModalResults([])
    setIgdbModalSearching(true)
    searchIGDB.mutate(
      { query: title },
      {
        onSuccess: (results) => setIgdbModalResults(results),
        onSettled: () => setIgdbModalSearching(false),
      },
    )
  }, [searchIGDB])

  const runIGDBSync = useCallback(async () => {
    if (!items || !igdbLinks) return
    try {
      const unlinked = items
        .filter((item) => !igdbLinks.has(item.id))
        .map((item) => ({
          itemId: item.id,
          title:  String(item.item_data.game_title ?? item.item_data.title ?? '').trim(),
        }))
        .filter((x) => x.title)

      if (unlinked.length === 0) return

      const { data, error } = await supabase.functions.invoke('igdb-proxy', {
        body: { action: 'batch-sync', titles: unlinked.map((x) => x.title) },
      })
      if (error) throw error
      if (data?.error) throw new Error(String(data.error))

      type BatchResult = { title: string; igdbId: number; igdbTitle: string; coverUrl: string | null; rating: number | null; genres: string[]; platforms: string[]; releaseYear: number | null }
      const matched = data as BatchResult[]
      if (matched.length === 0) return

      const byTitle = new Map(matched.map((m) => [m.title, m]))

      const rows = unlinked
        .filter((x) => byTitle.has(x.title))
        .map(({ itemId, title }) => {
          const m = byTitle.get(title)! as BatchResult
          return {
            analysis_item_id: itemId,
            igdb_game_id:     m.igdbId,
            game_title:       m.igdbTitle,
            cover_url:        m.coverUrl    ?? null,
            igdb_rating:      m.rating      ?? null,
            genres:           m.genres      ?? [],
            platforms:        m.platforms   ?? [],
            release_year:     m.releaseYear ?? null,
          }
        })
      if (rows.length > 0) await supabase.from('igdb_links').upsert(rows)

      const current = qc.getQueryData<Map<number, { igdbGameId: number; personalScore: number | null }>>(['igdb-links']) ?? new Map()
      const next    = new Map(current)
      for (const { itemId, title } of unlinked) {
        const m = byTitle.get(title) as { igdbId: number; igdbTitle: string; coverUrl: string | null; rating: number | null; genres: string[]; platforms: string[]; releaseYear: number | null } | undefined
        if (m) next.set(itemId, {
          igdbGameId:    m.igdbId,
          igdbTitle:     m.igdbTitle,
          personalScore: null,
          coverUrl:      m.coverUrl    ?? null,
          igdbRating:    m.rating      ?? null,
          genres:        m.genres      ?? [],
          platforms:     m.platforms   ?? [],
          releaseYear:   m.releaseYear ?? null,
        })
      }
      qc.setQueryData(['igdb-links'], next)
    } catch (e) {
      console.error('IGDB sync error:', e)
    }
  }, [items, igdbLinks, qc])

  // Auto-sync IGDB when items and links first load — runs once per page visit.
  useEffect(() => {
    if (isVideoGames && items && igdbLinks) runIGDBSync()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideoGames, items, igdbLinks])

  // ── TMDB integration (Movies + TV Series) ────────────────────────────────────
  const { data: tmdbLinks }   = useTMDBLinks()
  const upsertTMDBLink        = useUpsertTMDBLink()
  const deleteTMDBLink        = useDeleteTMDBLink()
  const updateTMDBScore       = useUpdateTMDBScore()
  const searchTMDB            = useSearchTMDB()

  const [tmdbModalContext,   setTmdbModalContext]   = useState<{ title: string; itemId: number } | null>(null)
  const [tmdbModalResults,   setTmdbModalResults]   = useState<TMDBTitle[]>([])
  const [tmdbModalSearching, setTmdbModalSearching] = useState(false)

  const openTMDBModal = useCallback((title: string, itemId: number) => {
    setTmdbModalContext({ title, itemId })
    setTmdbModalResults([])
    setTmdbModalSearching(true)
    searchTMDB.mutate(
      { query: title, mediaType: tmdbMediaType },
      {
        onSuccess: (results) => setTmdbModalResults(results),
        onSettled: () => setTmdbModalSearching(false),
      },
    )
  }, [searchTMDB, tmdbMediaType])

  const runTMDBSync = useCallback(async () => {
    if (!items || !tmdbLinks) return
    try {
      const titleKey = isMovies ? 'movie_title' : 'series_title'
      const unlinked = items
        .filter((item) => !tmdbLinks.has(item.id))
        .map((item) => ({
          itemId: item.id,
          title:  String(item.item_data[titleKey] ?? item.item_data.title ?? '').trim(),
        }))
        .filter((x) => x.title)

      if (unlinked.length === 0) return

      const { data, error } = await supabase.functions.invoke('tmdb-proxy', {
        body: { action: 'batch-sync', titles: unlinked.map((x) => x.title), mediaType: tmdbMediaType },
      })
      if (error) throw error
      if (data?.error) throw new Error(String(data.error))

      type BatchResult = { originalTitle: string; tmdbId: number; title: string; posterUrl: string | null; rating: number | null; genres: string[]; releaseYear: number | null; mediaType: 'movie' | 'tv' }
      const matched = data as BatchResult[]
      if (matched.length === 0) return

      const byTitle = new Map(matched.map((m) => [m.originalTitle, m]))
      const rows = unlinked
        .filter((x) => byTitle.has(x.title))
        .map(({ itemId, title }) => {
          const m = byTitle.get(title)! as BatchResult
          return {
            analysis_item_id: itemId,
            tmdb_id:          m.tmdbId,
            media_type:       m.mediaType,
            tmdb_title:       m.title       ?? null,
            poster_url:       m.posterUrl   ?? null,
            tmdb_rating:      m.rating      ?? null,
            genres:           m.genres      ?? [],
            release_year:     m.releaseYear ?? null,
          }
        })
      if (rows.length > 0) await supabase.from('tmdb_links').upsert(rows)

      const current = qc.getQueryData<Map<number, TMDBLink>>(['tmdb-links']) ?? new Map<number, TMDBLink>()
      const next    = new Map(current)
      for (const { itemId, title } of unlinked) {
        const m = byTitle.get(title)
        if (m) next.set(itemId, {
          tmdbId:        m.tmdbId,
          tmdbTitle:     m.title       ?? null,
          mediaType:     m.mediaType,
          personalScore: null,
          posterUrl:     m.posterUrl   ?? null,
          tmdbRating:    m.rating      ?? null,
          genres:        m.genres      ?? [],
          releaseYear:   m.releaseYear ?? null,
        })
      }
      qc.setQueryData(['tmdb-links'], next)
    } catch (e) {
      console.error('TMDB sync error:', e)
    }
  }, [items, tmdbLinks, isMovies, tmdbMediaType, qc])

  // Auto-sync TMDB when items and links first load — runs once per page visit.
  useEffect(() => {
    if (isTMDB && items && tmdbLinks) runTMDBSync()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTMDB, items, tmdbLinks])

  // Two-step add: first search (shows match for confirmation), then add
  const [addingTitle, setAddingTitle]           = useState<string | null>(null)
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null)
  // itemId currently being added to Hardcover (shows spinner in row)
  const [addingItemId, setAddingItemId]         = useState<number | null>(null)
  // Hardcover status filter for book grid ('all' | 'untracked' | '1'–'4')
  const [statusFilter, setStatusFilter]         = useState<string>('all')
  // Modal state
  const [modalContext, setModalContext] = useState<{ title: string; itemId: number; author: string } | null>(null)
  const [modalResults, setModalResults] = useState<HardcoverSearchResult[]>([])
  const [modalSearching, setModalSearching] = useState(false)

  const columns = useMemo(() => {
    const base = buildColumns(category?.output_fields ?? [], hiddenKeys, handleLocationClick, travelLocations)

    if (isBoardGames) {
      // Cover art column
      base.unshift({
        id: '_bgg_cover',
        header: '',
        accessorFn: (row) => bggLinks?.get(row.id)?.coverUrl ?? null,
        cell: ({ row }) => {
          const link = bggLinks?.get(row.original.id)
          const coverUrl = link?.coverUrl ?? link?.thumbnailUrl ?? null
          return (
            <div className="w-10 h-14 rounded overflow-hidden bg-muted flex-shrink-0">
              {coverUrl
                ? <img src={coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                : <div className="w-full h-full bg-muted" />
              }
            </div>
          )
        },
        enableSorting: false,
      } satisfies ColumnDef<AnalysisItem, unknown>)

      // BGG rating column
      base.push({
        id: '_bgg_rating',
        header: 'BGG ★',
        accessorFn: (row) => bggLinks?.get(row.id)?.bggRating ?? null,
        cell: ({ row }) => {
          const link = bggLinks?.get(row.original.id)
          if (!link) return <span className="text-muted-foreground text-xs">—</span>
          return (
            <div className="flex flex-col gap-0.5">
              {link.bggRating != null && (
                <span className="text-xs font-semibold tabular-nums">
                  {link.bggRating.toFixed(1)}
                  <span className="text-[10px] text-muted-foreground font-normal"> /10</span>
                </span>
              )}
              {link.bggWeight != null && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  W {link.bggWeight.toFixed(1)}/5
                </span>
              )}
            </div>
          )
        },
        enableSorting: true,
      } satisfies ColumnDef<AnalysisItem, unknown>)

      // BGG link column (now points to the actual game page when we have an ID)
      base.push({
        id: '_bgg_link',
        header: 'BGG',
        accessorFn: (row) => bggLinks?.get(row.id)?.bggGameId ?? null,
        cell: ({ row }) => {
          const link  = bggLinks?.get(row.original.id)
          const name  = String(row.original.item_data.game_name ?? '')
          const url   = link?.bggGameId
            ? `https://boardgamegeek.com/boardgame/${link.bggGameId}`
            : `https://boardgamegeek.com/geeksearch.php?action=search&q=${encodeURIComponent(name)}&objecttype=boardgame`
          return (
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary hover:underline whitespace-nowrap">
              BGG →
            </a>
          )
        },
        enableSorting: false,
      } satisfies ColumnDef<AnalysisItem, unknown>)
    }

    if (productConfig) {
      base.push({
        id: '_shop',
        header: 'Shop',
        accessorFn: (row) => String(row.item_data[productConfig.nameField] ?? ''),
        cell: ({ row }) => {
          const shopLink = getShopLink(row.original)
          if (!shopLink) return <span className="text-muted-foreground text-xs">—</span>
          // Green for specific links; default for generic search fallbacks
          const isDirect = shopLink.label === 'View →' || shopLink.label === 'Link →' || shopLink.label === 'Storefront →'
          return (
            <a
              href={shopLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-xs hover:underline whitespace-nowrap ${isDirect ? 'text-green-600 dark:text-green-400' : 'text-primary'}`}
              title={isDirect ? 'Direct link from source post' : undefined}
            >
              {shopLink.label}
            </a>
          )
        },
        enableSorting: false,
      } satisfies ColumnDef<AnalysisItem, unknown>)
    }

    if (isFood) {
      base.push({
        id: '_recipe',
        header: 'Recipe',
        accessorFn: (row) => (row.source_post_id && recipeCards?.has(row.source_post_id) ? 1 : 0),
        cell: ({ row }) => {
          const postId = row.original.source_post_id
          const has = postId != null && recipeCards?.has(postId)
          if (!has) return <span className="text-muted-foreground text-xs">—</span>
          return (
            <Link
              to={`/category/${slug}/recipe/${encodeURIComponent(postId)}`}
              className="text-xs text-primary hover:underline whitespace-nowrap"
            >
              Recipe →
            </Link>
          )
        },
        enableSorting: false,
      } satisfies ColumnDef<AnalysisItem, unknown>)
    }

    if (isMusic) {
      base.push({
        id: '_spotify',
        header: 'Listen',
        accessorFn: (row) => String(row.item_data.title ?? ''),
        cell: ({ row }) => {
          const title = String(row.original.item_data.title ?? '').trim()
          const artist = String(row.original.item_data.artist ?? '').trim()
          if (!title) return <span className="text-muted-foreground text-xs">—</span>
          const q = encodeURIComponent([title, artist].filter(Boolean).join(' '))
          return (
            <a
              href={`https://open.spotify.com/search/${q}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline whitespace-nowrap"
              title="Search this on Spotify"
            >
              Spotify →
            </a>
          )
        },
        enableSorting: false,
      } satisfies ColumnDef<AnalysisItem, unknown>)
    }

    if (isMtg) {
      base.push({
        id: '_manapool',
        header: 'Manapool',
        accessorFn: (row) => String(row.item_data.commander_name ?? ''),
        cell: ({ getValue }) => {
          const name = getValue() as string
          if (!name) return <span className="text-muted-foreground text-xs">—</span>
          const cards = name.split(' & ').map((s) => s.trim()).filter(Boolean)
          return (
            <div className="flex flex-col gap-1">
              {cards.map((card) => {
                const slug = card.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-')
                return (
                  <a
                    key={card}
                    href={`https://manapool.com/card/${slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline whitespace-nowrap"
                  >
                    {card} →
                  </a>
                )
              })}
            </div>
          )
        },
        enableSorting: false,
      } satisfies ColumnDef<AnalysisItem, unknown>)
    }
    if (isAnime) {
      // ── Always-visible columns: cover art + MAL community score ─────────
      const indexCol  = base.find((c) => c.id === '_index')
      const sourceCol = base.find((c) => c.id === '_source')
      const dynCols   = base.filter((c) => !String(c.id ?? '').startsWith('_'))

      const malCoverCol: ColumnDef<AnalysisItem, unknown> = {
        id: '_mal_cover',
        header: '',
        accessorFn: () => null,
        cell: ({ row }) => {
          const link     = malLinks?.get(row.original.id)
          const coverUrl = link?.coverUrl
          const title    = link?.seriesTitle ?? String(row.original.item_data.series_title ?? '')
          return (
            <div className="w-10 h-[60px] rounded overflow-hidden bg-muted/60 flex-none">
              {coverUrl && (
                <img src={coverUrl} alt={title} className="w-full h-full object-cover" />
              )}
            </div>
          )
        },
        enableSorting: false,
        size: 52,
      }

      const malScoreCol: ColumnDef<AnalysisItem, unknown> = {
        id: '_mal_community_score',
        header: 'MAL',
        accessorFn: (row) => malLinks?.get(row.id)?.malScore ?? null,
        cell: ({ row }) => {
          const link   = malLinks?.get(row.original.id)
          const score  = link?.malScore
          const genres = link?.genres
          const itemId = row.original.id
          const title  = String(row.original.item_data.series_title ?? '')

          if (!link) {
            // No mal_link yet — show a manual link button (auth required to add to MAL list)
            return (
              <button
                onClick={() => {
                  setMalModalContext({ title, itemId })
                  setMalModalResults([])
                  setMalModalSearching(true)
                  searchMAL.mutate(
                    { title },
                    {
                      onSuccess: (results) => setMalModalResults(results),
                      onSettled: () => setMalModalSearching(false),
                    },
                  )
                }}
                className="text-xs cursor-pointer text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                + Link
              </button>
            )
          }
          return (
            <div className="flex flex-col gap-1.5">
              {score != null && (
                <span className="text-xs font-medium text-foreground tabular-nums">
                  {score.toFixed(2)}/10
                </span>
              )}
              {genres && genres.length > 0 && (
                <div className="flex flex-wrap gap-0.5">
                  {genres.slice(0, 2).map((g) => (
                    <span key={g} className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 leading-none whitespace-nowrap">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        },
        enableSorting: true,
      }

      // Rebuild column order: # | Cover | [content fields] | MAL score | [auth cols if logged in] | Source
      const authCols: ColumnDef<AnalysisItem, unknown>[] = []
      if (malAuth.isAuthenticated) {
        authCols.push(
        {
          id: '_mal_status',
          header: 'MAL Status',
          accessorFn: (row) => {
            const link = malLinks?.get(row.id)
            return link != null ? malLibrary?.byId.get(link.malAnimeId)?.status ?? null : null
          },
          cell: ({ row }) => {
            const title    = String(row.original.item_data.series_title ?? '')
            const itemId   = row.original.id
            const link     = malLinks?.get(itemId)
            const linkedId = link?.malAnimeId
            const entry    = linkedId != null ? malLibrary?.byId.get(linkedId) : undefined

            if (malAddingItemId === itemId) {
              return (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <svg className="animate-spin h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Adding…
                </span>
              )
            }
            if (!entry) {
              // Has enrichment data from backend but not yet in user's personal list
              const hasLink = malLinks?.has(itemId)
              return (
                <button
                  onClick={() => {
                    setMalModalContext({ title, itemId })
                    setMalModalResults([])
                    setMalModalSearching(true)
                    searchMAL.mutate(
                      { title },
                      {
                        onSuccess: (results) => setMalModalResults(results),
                        onSettled: () => setMalModalSearching(false),
                      },
                    )
                  }}
                  className="text-xs cursor-pointer text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  {hasLink ? '+ Track on MAL' : '+ Add to MAL'}
                </button>
              )
            }
            if (malUpdatingId === entry.malId) {
              return (
                <span className="text-xs text-muted-foreground animate-pulse">
                  {MAL_STATUS[entry.status] ?? '…'}
                </span>
              )
            }
            return (
              <div className="flex items-center gap-1 group">
                <select
                  value={entry.status}
                  onChange={(e) => {
                    setMalUpdatingId(entry.malId)
                    updateMALStatus.mutate(
                      { malId: entry.malId, status: e.target.value },
                      { onSettled: () => setMalUpdatingId(null) },
                    )
                  }}
                  className="text-xs bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground focus:outline-none"
                >
                  {Object.entries(MAL_STATUS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <button
                  title="Unlink from MAL"
                  onClick={() => deleteMALLink.mutate(itemId)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive text-xs leading-none cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )
          },
          enableSorting: true,
        } satisfies ColumnDef<AnalysisItem, unknown>,
        {
          id: '_mal_score',
          header: 'Score',
          accessorFn: (row) => {
            const link = malLinks?.get(row.id)
            return link != null ? malLibrary?.byId.get(link.malAnimeId)?.score ?? null : null
          },
          cell: ({ row }) => {
            const itemId   = row.original.id
            const link     = malLinks?.get(itemId)
            const linkedId = link?.malAnimeId
            const entry    = linkedId != null ? malLibrary?.byId.get(linkedId) : undefined
            if (!entry) return <span className="text-muted-foreground text-xs">—</span>
            return (
              <select
                value={entry.score}
                onChange={(e) =>
                  updateMALScore.mutate({ malId: entry.malId, score: Number(e.target.value) })
                }
                className="text-xs bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground focus:outline-none"
              >
                <option value={0}>—</option>
                {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                  <option key={n} value={n}>{n}/10</option>
                ))}
              </select>
            )
          },
          enableSorting: true,
        } satisfies ColumnDef<AnalysisItem, unknown>,
        )
      } // end if (malAuth.isAuthenticated)

      return [
        ...(indexCol  ? [indexCol]  : []),
        malCoverCol,
        ...dynCols,
        malScoreCol,
        ...authCols,
        ...(sourceCol ? [sourceCol] : []),
      ]
    }

    // ── IGDB columns (Video Games) — custom layout for readability ───────────
    if (isVideoGames) {
      // Pull the columns we want to keep from the standard set
      const indexCol  = base.find((c) => c.id === '_index')
      const sourceCol = base.find((c) => c.id === '_source')
      // All dynamic output_field columns (game_title, genre, playtime, why_play_it, etc.)
      const dynCols = base.filter((c) => !String(c.id ?? '').startsWith('_'))

      const igdbCoverCol: ColumnDef<AnalysisItem, unknown> = {
        id: '_igdb_cover',
        header: '',
        accessorFn: () => null,
        cell: ({ row }) => {
          const link = igdbLinks?.get(row.original.id)
          return (
            <div className="w-14 h-[78px] rounded overflow-hidden bg-muted/60 flex-none">
              {link?.coverUrl && (
                <img
                  src={link.coverUrl}
                  alt={link.igdbTitle ?? ''}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          )
        },
        enableSorting: false,
        size: 72,
      }

      const igdbRatingCol: ColumnDef<AnalysisItem, unknown> = {
        id: '_igdb_rating',
        header: 'IGDB',
        accessorFn: (row) => igdbLinks?.get(row.id)?.igdbRating ?? null,
        cell: ({ row }) => {
          const itemId    = row.original.id
          const link      = igdbLinks?.get(itemId)
          const gameTitle = String(row.original.item_data.game_title ?? '')
          if (!link) {
            return (
              <button
                onClick={() => openIGDBModal(gameTitle, itemId)}
                className="text-xs cursor-pointer text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors whitespace-nowrap"
              >
                + Link
              </button>
            )
          }
          return (
            <div className="flex flex-col gap-1.5">
              {/* Rating + action buttons */}
              <div className="flex items-center gap-1 group">
                <span className="text-xs font-medium text-foreground tabular-nums">
                  {link.igdbRating != null ? `${Math.round(link.igdbRating)}/100` : '—'}
                </span>
                <button
                  title="Re-link game"
                  onClick={() => openIGDBModal(gameTitle, itemId)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground text-xs leading-none cursor-pointer"
                >↺</button>
                <button
                  title="Unlink from IGDB"
                  onClick={() => deleteIGDBLink.mutate(itemId)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive text-xs leading-none cursor-pointer"
                >✕</button>
              </div>
              {/* Genre tags inline */}
              {link.genres.length > 0 && (
                <div className="flex flex-wrap gap-0.5">
                  {link.genres.slice(0, 2).map((g) => (
                    <span key={g} className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 leading-none whitespace-nowrap">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        },
        enableSorting: true,
      }

      const igdbScoreCol: ColumnDef<AnalysisItem, unknown> = {
        id: '_igdb_my_score',
        header: 'My Score',
        accessorFn: (row) => igdbLinks?.get(row.id)?.personalScore ?? null,
        cell: ({ row }) => {
          const itemId = row.original.id
          const link   = igdbLinks?.get(itemId)
          if (!link) return <span className="text-muted-foreground text-xs">—</span>
          return (
            <select
              value={link.personalScore ?? 0}
              onChange={(e) =>
                updateIGDBScore.mutate({ analysisItemId: itemId, personalScore: Number(e.target.value) || null })
              }
              className="text-xs bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground focus:outline-none"
            >
              <option value={0}>—</option>
              {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                <option key={n} value={n}>{n}/10</option>
              ))}
            </select>
          )
        },
        enableSorting: true,
      }

      // Custom order: # | Cover | [content fields] | IGDB | My Score | Source
      // Drops Added, Posted, Platform — noise for a personal game list.
      return [
        ...(indexCol  ? [indexCol]  : []),
        igdbCoverCol,
        ...dynCols,
        igdbRatingCol,
        igdbScoreCol,
        ...(sourceCol ? [sourceCol] : []),
      ]
    }

    // ── TMDB columns (Movies + TV Series) — same layout as Video Games ───────
    if (isTMDB) {
      const indexCol  = base.find((c) => c.id === '_index')
      const sourceCol = base.find((c) => c.id === '_source')
      const dynCols   = base.filter((c) => !String(c.id ?? '').startsWith('_'))
      const titleKey  = isMovies ? 'movie_title' : 'series_title'

      const tmdbCoverCol: ColumnDef<AnalysisItem, unknown> = {
        id: '_tmdb_cover',
        header: '',
        accessorFn: () => null,
        cell: ({ row }) => {
          const link = tmdbLinks?.get(row.original.id)
          return (
            <div className="w-14 h-[78px] rounded overflow-hidden bg-muted/60 flex-none">
              {link?.posterUrl && (
                <img
                  src={link.posterUrl}
                  alt={link.tmdbTitle ?? ''}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          )
        },
        enableSorting: false,
        size: 72,
      }

      const tmdbRatingCol: ColumnDef<AnalysisItem, unknown> = {
        id: '_tmdb_rating',
        header: 'TMDB',
        accessorFn: (row) => tmdbLinks?.get(row.id)?.tmdbRating ?? null,
        cell: ({ row }) => {
          const itemId = row.original.id
          const link   = tmdbLinks?.get(itemId)
          const title  = String(row.original.item_data[titleKey] ?? row.original.item_data.title ?? '')
          if (!link) {
            return (
              <button
                onClick={() => openTMDBModal(title, itemId)}
                className="text-xs cursor-pointer text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors whitespace-nowrap"
              >
                + Link
              </button>
            )
          }
          return (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1 group">
                <span className="text-xs font-medium text-foreground tabular-nums">
                  {link.tmdbRating != null ? `${link.tmdbRating.toFixed(1)}/10` : '—'}
                </span>
                <button
                  title="Re-link"
                  onClick={() => openTMDBModal(title, itemId)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground text-xs leading-none cursor-pointer"
                >↺</button>
                <button
                  title="Unlink from TMDB"
                  onClick={() => deleteTMDBLink.mutate(itemId)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive text-xs leading-none cursor-pointer"
                >✕</button>
              </div>
              {link.genres.length > 0 && (
                <div className="flex flex-wrap gap-0.5">
                  {link.genres.slice(0, 2).map((g) => (
                    <span key={g} className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 leading-none whitespace-nowrap">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        },
        enableSorting: true,
      }

      const tmdbScoreCol: ColumnDef<AnalysisItem, unknown> = {
        id: '_tmdb_my_score',
        header: 'My Score',
        accessorFn: (row) => tmdbLinks?.get(row.id)?.personalScore ?? null,
        cell: ({ row }) => {
          const itemId = row.original.id
          const link   = tmdbLinks?.get(itemId)
          if (!link) return <span className="text-muted-foreground text-xs">—</span>
          return (
            <select
              value={link.personalScore ?? 0}
              onChange={(e) =>
                updateTMDBScore.mutate({ analysisItemId: itemId, personalScore: Number(e.target.value) || null })
              }
              className="text-xs bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground focus:outline-none"
            >
              <option value={0}>—</option>
              {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                <option key={n} value={n}>{n}/10</option>
              ))}
            </select>
          )
        },
        enableSorting: true,
      }

      const tmdbYearCol: ColumnDef<AnalysisItem, unknown> = {
        id: '_tmdb_year',
        header: 'Year',
        accessorFn: (row) => tmdbLinks?.get(row.id)?.releaseYear ?? null,
        cell: ({ row }) => {
          const year = tmdbLinks?.get(row.original.id)?.releaseYear
          return (
            <span className="text-muted-foreground tabular-nums text-xs whitespace-nowrap">
              {year ?? '—'}
            </span>
          )
        },
        enableSorting: true,
      }

      return [
        ...(indexCol  ? [indexCol]  : []),
        tmdbCoverCol,
        ...dynCols,
        tmdbYearCol,
        tmdbRatingCol,
        tmdbScoreCol,
        ...(sourceCol ? [sourceCol] : []),
      ]
    }

    return base
  }, [category?.output_fields, hiddenKeys, handleLocationClick, travelLocations,
      isBoardGames, bggLinks, isMtg, isAnime, isFood, isMusic, recipeCards, slug,
      isVideoGames, malAuth.isAuthenticated, malLibrary, malLinks, malAddingItemId, malUpdatingId,
      updateMALStatus, updateMALScore, searchMAL, deleteMALLink,
      igdbLinks, deleteIGDBLink, updateIGDBScore, openIGDBModal,
      isTMDB, isMovies, tmdbLinks, deleteTMDBLink, updateTMDBScore, openTMDBModal,
      productConfig, getShopLink])

  // Flag lookup for the dropdown
  const getOptionLabel = (value: string) => {
    if (singleGroupField === 'language') return `${getLanguageFlag(value)}  ${value}`
    if (hierarchyKey1 === 'country') return `${getCountryFlag(value)}  ${value}`
    return value
  }

  const theme = getCategoryTheme(categoryName)

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Hardcover search modal */}
      {modalContext && (
        <HardcoverSearchModal
          initialQuery={`${modalContext.title} ${modalContext.author}`.trim()}
          results={modalResults}
          isSearching={modalSearching}
          onClose={() => setModalContext(null)}
          onSearch={async (query) => {
            setModalSearching(true)
            return new Promise((resolve) => {
              searchBook.mutate(
                { title: query },
                {
                  onSuccess: (results) => { setModalResults(results); resolve(results) },
                  onError:   ()        => resolve([]),
                  onSettled: ()        => setModalSearching(false),
                },
              )
            })
          }}
          onSelect={(result) => {
            const { itemId } = modalContext
            setModalContext(null)
            setAddingItemId(itemId)

            addBook.mutate(
              { bookId: result.bookId, statusId: 1 },
              {
                onSuccess: () => {
                  upsertLink.mutate(
                    {
                      analysisItemId:  itemId,
                      hardcoverBookId: result.bookId,
                      bookTitle:       result.title,
                      coverUrl:        result.coverUrl,
                    },
                    { onSettled: () => setAddingItemId(null) },
                  )
                },
                onError: () => setAddingItemId(null),
              },
            )
          }}
        />
      )}

      {/* MAL search modal */}
      {malModalContext && (
        <MALSearchModal
          initialQuery={malModalContext.title}
          results={malModalResults}
          isSearching={malModalSearching}
          onClose={() => setMalModalContext(null)}
          onSearch={async (query) => {
            setMalModalSearching(true)
            return new Promise((resolve) => {
              searchMAL.mutate(
                { title: query },
                {
                  onSuccess: (results) => { setMalModalResults(results); resolve(results) },
                  onError:   ()        => resolve([]),
                  onSettled: ()        => setMalModalSearching(false),
                },
              )
            })
          }}
          onSelect={(result) => {
            const { itemId } = malModalContext
            setMalModalContext(null)
            setMalAddingItemId(itemId)
            addMALAnime.mutate(
              { malId: result.malId, status: 'plan_to_watch' },
              {
                onSuccess: () => {
                  upsertMALLink.mutate(
                    { analysisItemId: itemId, malAnimeId: result.malId, seriesTitle: result.title },
                    { onSettled: () => setMalAddingItemId(null) },
                  )
                },
                onError: () => setMalAddingItemId(null),
              },
            )
          }}
        />
      )}

      {/* TMDB search modal */}
      {tmdbModalContext && (
        <TMDBSearchModal
          initialQuery={tmdbModalContext.title}
          mediaType={tmdbMediaType}
          results={tmdbModalResults}
          isSearching={tmdbModalSearching}
          onClose={() => setTmdbModalContext(null)}
          onSearch={(query) => {
            setTmdbModalSearching(true)
            searchTMDB.mutate(
              { query, mediaType: tmdbMediaType },
              {
                onSuccess: (results) => setTmdbModalResults(results),
                onSettled: () => setTmdbModalSearching(false),
              },
            )
          }}
          onSelect={(result) => {
            const { itemId } = tmdbModalContext
            setTmdbModalContext(null)
            upsertTMDBLink.mutate({
              analysisItemId: itemId,
              tmdbId:         result.tmdbId,
              mediaType:      result.mediaType,
              tmdbTitle:      result.title,
              posterUrl:      result.posterUrl,
              tmdbRating:     result.rating,
              genres:         result.genres,
              releaseYear:    result.releaseYear,
            })
          }}
        />
      )}

      {/* IGDB search modal */}
      {igdbModalContext && (
        <IGDBSearchModal
          initialQuery={igdbModalContext.title}
          results={igdbModalResults}
          isSearching={igdbModalSearching}
          onClose={() => setIgdbModalContext(null)}
          onSearch={(query) => {
            setIgdbModalSearching(true)
            searchIGDB.mutate(
              { query },
              {
                onSuccess: (results) => setIgdbModalResults(results),
                onSettled: () => setIgdbModalSearching(false),
              },
            )
          }}
          onSelect={(result) => {
            const { itemId } = igdbModalContext
            setIgdbModalContext(null)
            upsertIGDBLink.mutate({
              analysisItemId: itemId,
              igdbGameId:     result.igdbId,
              gameTitle:      result.title,
              coverUrl:       result.coverUrl,
              igdbRating:     result.rating,
              genres:         result.genres,
              platforms:      result.platforms,
              releaseYear:    result.releaseYear,
            })
          }}
        />
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Hero header */}
        <div className="mb-6 flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shrink-0 ${theme.iconBgClass}`}>
            <theme.icon size={24} className={theme.iconClass} aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground truncate">
              {categoryName}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
              {platformMix.total} item{platformMix.total !== 1 ? 's' : ''}
              {platformMix.reddit > 0 && platformMix.instagram > 0 && (
                <> · {platformMix.reddit} Reddit · {platformMix.instagram} Instagram</>
              )}
            </p>
          </div>
        </div>

        {/* MAL connect / disconnect integration card */}
        {isAnime && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3">
            {malAuth.isAuthenticated ? (
              <>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30 shrink-0">
                    <Play size={15} className="text-violet-600 dark:text-violet-400" aria-hidden />
                  </span>
                  <span className="text-sm font-medium text-foreground">MyAnimeList</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden />
                    Synced
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {malConfirming === 'disconnect' ? (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-foreground font-medium">Disconnect MAL?</span>
                      <button
                        onClick={() => { setMalConfirming(null); malAuth.logout() }}
                        className="text-destructive hover:text-destructive/80 underline underline-offset-2 cursor-pointer"
                      >Confirm</button>
                      <button
                        onClick={() => setMalConfirming(null)}
                        className="text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer"
                      >Cancel</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setMalConfirming('disconnect')}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 whitespace-nowrap cursor-pointer"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30 shrink-0">
                    <Play size={15} className="text-violet-600 dark:text-violet-400" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">MyAnimeList</p>
                    <p className="text-xs text-muted-foreground">Connect to track your watch status and scores.</p>
                  </div>
                </div>
                <button
                  onClick={malAuth.login}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Connect MAL
                </button>
              </>
            )}
          </div>
        )}



        {/* Toolbar */}
        <div className="sticky top-14 z-30 -mx-6 mb-6 border-b border-border/60 bg-background/80 px-6 py-3 backdrop-blur-md">
          <div className="flex flex-col gap-3">
            {/* Row 1: platform segmented + group-by + search + map toggle */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Platform filter — segmented control */}
              <div className="flex items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5">
                {(['all', 'reddit', 'instagram'] as const).map((p) => {
                  const active = (p === 'all' && !platform) || platform === p
                  return (
                    <button
                      key={p}
                      onClick={() => setParam('platform', p === 'all' ? null : p)}
                      className={`rounded-md px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        active
                          ? 'bg-card shadow-sm font-medium text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  )
                })}
              </div>

              {/* Group-by dropdown */}
              {level1Options.length > 0 && (
                <div className="relative">
                  <select
                    value={activeGroup}
                    onChange={(e) => { setParam('group', e.target.value); setFlyTarget(null) }}
                    className="appearance-none rounded-lg border bg-card pl-3 pr-8 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    {level1Options.map((opt) => (
                      <option key={opt} value={opt}>{getOptionLabel(opt)}</option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  />
                </div>
              )}

              {/* Search */}
              <div className="relative ml-auto">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-64 rounded-lg border bg-card pl-9 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {/* Map / Table toggle — segmented control (hierarchical only) */}
              {isHierarchical && (
                <div className="flex items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5">
                  <button
                    onClick={() => setParam('view', 'table')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      viewMode === 'table'
                        ? 'bg-card shadow-sm font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Table2 size={14} /> Table
                  </button>
                  <button
                    onClick={() => setParam('view', 'map')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      viewMode === 'map'
                        ? 'bg-card shadow-sm font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <MapIcon size={14} /> Map
                  </button>
                </div>
              )}
            </div>

            {/* Row 2: Hardcover status filter (books only) */}
            {isBooks && (
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'all',       label: 'All',            cls: 'data-[active]:bg-primary data-[active]:text-primary-foreground data-[active]:border-primary' },
                  { key: 'untracked', label: 'Not Added',      cls: 'data-[active]:bg-muted data-[active]:text-foreground data-[active]:border-border' },
                  { key: '1',         label: 'Want to Read',   cls: 'data-[active]:bg-blue-50 data-[active]:text-blue-700 data-[active]:border-blue-400 dark:data-[active]:bg-blue-900/30 dark:data-[active]:text-blue-300 dark:data-[active]:border-blue-700' },
                  { key: '2',         label: 'Reading',        cls: 'data-[active]:bg-yellow-50 data-[active]:text-yellow-700 data-[active]:border-yellow-400 dark:data-[active]:bg-yellow-900/30 dark:data-[active]:text-yellow-300 dark:data-[active]:border-yellow-700' },
                  { key: '3',         label: 'Read',           cls: 'data-[active]:bg-green-50 data-[active]:text-green-700 data-[active]:border-green-400 dark:data-[active]:bg-green-900/30 dark:data-[active]:text-green-300 dark:data-[active]:border-green-700' },
                  { key: '4',         label: 'Did Not Finish', cls: 'data-[active]:bg-muted data-[active]:text-foreground data-[active]:border-border' },
                ] as const).map(({ key, label, cls }) => {
                  const active = statusFilter === key
                  return (
                    <button
                      key={key}
                      data-active={active ? '' : undefined}
                      onClick={() => setStatusFilter(key)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${cls} ${
                        active ? '' : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* States */}
        {isLoading && (
          <div className="rounded-xl border bg-card overflow-hidden shadow-xs">
            <div className="flex items-center gap-4 border-b border-border/60 bg-muted/40 px-3 h-10">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-20" />
              ))}
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border/60 px-3 py-2.5">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-4 w-24" />
                ))}
              </div>
            ))}
          </div>
        )}
        {error && <div className="text-destructive">Failed to load items.</div>}

        {/* Hierarchical: map — always mounted so flyTo works instantly from
            the table. Hidden with CSS when in table view. */}
        {cityGroups && (
          <div className={viewMode === 'map' ? '' : 'hidden'}>
            <Suspense fallback={<div className="text-muted-foreground">Loading map…</div>}>
              <TravelMap
              items={level1Items}
              locationsMap={travelLocations}
              flyTarget={flyTarget}
              visible={viewMode === 'map'}
              country={isHierarchical && hierarchyKey1 === 'country' ? activeGroup : undefined}
            />
            </Suspense>
          </div>
        )}

        {/* Hierarchical: table view — one table per city */}
        {cityGroups && viewMode === 'table' && (
          <div className="space-y-10">
            {cityGroups.map(([city, cityItems]) => (
              <CityTable
                key={city}
                city={city}
                items={cityItems}
                columns={columns}
                search={search}
              />
            ))}
          </div>
        )}

        {/* Books: card grid */}
        {!cityGroups && items && isBooks && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {(singleGroupField ? level1Items : items)
              .filter((item) => {
                // Text search
                if (search) {
                  const s = search.toLowerCase()
                  const textMatch =
                    String(item.item_data.book_title  ?? '').toLowerCase().includes(s) ||
                    String(item.item_data.author      ?? '').toLowerCase().includes(s) ||
                    String(item.item_data.genre       ?? '').toLowerCase().includes(s) ||
                    String(item.item_data.why_read_it ?? '').toLowerCase().includes(s)
                  if (!textMatch) return false
                }
                // Hardcover status filter
                if (statusFilter !== 'all') {
                  const title = String(item.item_data.book_title ?? '')
                  const book  = hardcoverLibrary
                    ? findHardcoverBook(hardcoverLibrary, title, hardcoverLinks?.get(item.id)?.hardcoverBookId)
                    : undefined
                  if (statusFilter === 'untracked') return !book
                  if (!book) return false
                  return String(book.statusId) === statusFilter
                }
                return true
              })
              .map((item) => {
                const title   = String(item.item_data.book_title ?? '')
                const author  = String(item.item_data.author ?? '')
                const hcLink  = hardcoverLinks?.get(item.id) as HardcoverLinkData | undefined
                const book    = hardcoverLibrary
                  ? findHardcoverBook(hardcoverLibrary, title, hcLink?.hardcoverBookId)
                  : undefined
                return (
                  <BookCard
                    key={item.id}
                    item={item}
                    book={book}
                    hcLink={hcLink}
                    isAdding={addingItemId === item.id}
                    isSearching={addingTitle === title}
                    isUpdatingStatus={book != null && updatingStatusId === book.userBookId}
                    onAddClick={() => {
                      setAddingTitle(title)
                      setModalContext({ title, itemId: item.id, author })
                      setModalResults([])
                      setModalSearching(true)
                      searchBook.mutate(
                        { title, author },
                        {
                          onSuccess: (results) => setModalResults(results),
                          onSettled: () => { setModalSearching(false); setAddingTitle(null) },
                        },
                      )
                    }}
                    onRatingChange={(rating) => book && updateRating.mutate({ userBookId: book.userBookId, rating })}
                    onStatusChange={(statusId) => {
                      if (!book) return
                      setUpdatingStatusId(book.userBookId)
                      updateStatus.mutate(
                        { userBookId: book.userBookId, statusId },
                        { onSettled: () => setUpdatingStatusId(null) },
                      )
                    }}
                  />
                )
              })}
          </div>
        )}

        {/* Flat view: single table (language, or no grouping, non-books) */}
        {!cityGroups && items && !isBooks && (
          <DataTable
            columns={columns}
            data={singleGroupField ? level1Items : items}
            globalFilter={search}
          />
        )}

        {/* Surface every saved post — classified posts with no extracted
            highlight render as collapsible link-out cards. */}
        {categoryName && (
          <SavedPostsSection
            categoryName={categoryName}
            platform={platform}
            surfacedPostIds={surfacedPostIds}
          />
        )}
      </div>
    </div>
  )
}
