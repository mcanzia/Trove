import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useState, useMemo, useRef, useCallback, useEffect, lazy, Suspense } from 'react'
import { toSlug } from '@/lib/utils'
import { type ColumnDef } from '@tanstack/react-table'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

import { ChevronDown, MapPin, Table2, Map as MapIcon } from 'lucide-react'
import { useAnalysisItems } from '@/hooks/useAnalysisItems'
import { useCategories } from '@/hooks/useCategories'
import { DataTable } from '@/components/DataTable'
import { getLanguageFlag } from '@/lib/languageFlags'
import { getCountryFlag } from '@/lib/countryFlags'
import {
  useHardcoverBooks,
  useHardcoverLinks,
  useUpsertHardcoverLink,
  useDeleteHardcoverLink,
  useUpdateHardcoverRating,
  useUpdateHardcoverStatus,
  useSearchHardcoverBook,
  useAddBookByTitle,
  findHardcoverBook,
  type HardcoverSearchResult,
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
import type { AnalysisItem, OutputField, Platform } from '@/types'
import type { FlyTarget } from '@/components/TravelMap'

const TravelMap = lazy(() => import('@/components/TravelMap'))

// ── column builder ────────────────────────────────────────────────────────────

function buildColumns(
  fields: OutputField[],
  hiddenKeys: string[] = [],
  onLocationClick?: (lat: number, lng: number, itemId: number) => void,
): ColumnDef<AnalysisItem, unknown>[] {
  const dynamic: ColumnDef<AnalysisItem, unknown>[] = fields
    .filter((f) => !hiddenKeys.includes(f.key))
    .map((f) => ({
      id: f.key,
      header: f.label,
      accessorFn: (row) => row.item_data[f.key] ?? '',
      cell: ({ getValue }) => (
        <span className="text-foreground">{String(getValue() ?? '')}</span>
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
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
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
        const locs = row.item_data._locations as { lat: number; lng: number }[] | undefined
        if (!locs?.length) return ''
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
        <MapPin size={15} className="text-muted-foreground shrink-0" />
        <h2 className="text-base font-semibold text-foreground">{city}</h2>
        <span className="text-xs text-muted-foreground">
          {items.length} tip{items.length !== 1 ? 's' : ''}
        </span>
      </div>
      <DataTable columns={columns} data={items} globalFilter={search} />
    </section>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>()
  // Match the slug back to the real category name via the same toSlug transform
  const { data: categories } = useCategories()
  const category = categories?.find((c) => toSlug(c.name) === slug)
  const categoryName = category?.name ?? slug ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null)
  const flyKeyRef = useRef(0)

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
      flyKeyRef.current += 1
      setFlyTarget({ lat, lng, key: flyKeyRef.current, itemId })
      setParam('view', 'map')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHierarchical, setParam])

  const qc      = useQueryClient()
  const isBooks       = categoryName === 'Books Worth Reading'
  const isMtg         = categoryName === 'Magic: The Gathering'
  const isBoardGames  = categoryName === 'Board Games'
  const isAnime       = categoryName === 'Anime & Manga'
  const isVideoGames  = categoryName === 'Video Game Recommendations'
  const isMovies      = categoryName === 'Movies & Film Recommendations'
  const isTVSeries    = categoryName === 'TV Series Recommendations'
  const isTMDB        = isMovies || isTVSeries
  const tmdbMediaType = isTVSeries ? 'tv' : 'movie'
  const { data: hardcoverLibrary }  = useHardcoverBooks()
  const { data: hardcoverLinks }    = useHardcoverLinks()
  const updateRating    = useUpdateHardcoverRating()
  const updateStatus    = useUpdateHardcoverStatus()
  const searchBook      = useSearchHardcoverBook()
  const addBook         = useAddBookByTitle()
  const upsertLink      = useUpsertHardcoverLink()
  const deleteLink      = useDeleteHardcoverLink()

  // Whenever the library and links are both loaded, remove any links
  // whose bookId no longer exists in the Hardcover library (book was removed).
  useEffect(() => {
    if (!hardcoverLibrary || !hardcoverLinks) return
    for (const [itemId, bookId] of hardcoverLinks) {
      if (!hardcoverLibrary.byBookId.has(bookId)) {
        deleteLink.mutate(itemId)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardcoverLibrary, hardcoverLinks])
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

  // Clean up stale mal_links whose anime no longer exists in library
  useEffect(() => {
    if (!malLibrary || !malLinks) return
    for (const [itemId, animeId] of malLinks) {
      if (!malLibrary.byId.has(animeId)) deleteMALLink.mutate(itemId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [malLibrary, malLinks])

  // Auto-sync: title-match unlinked Trove entries against existing MAL library.
  const [malSyncing, setMalSyncing] = useState(false)

  const clearAllMALLinks = useCallback(async () => {
    if (!malLinks || malLinks.size === 0) return
    // Optimistically clear UI immediately
    qc.setQueryData(['mal-links'], new Map())
    // Single delete request for all IDs
    const ids = Array.from(malLinks.keys())
    await supabase.from('mal_links').delete().in('analysis_item_id', ids)
    qc.invalidateQueries({ queryKey: ['mal-links'] })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [malLinks, qc])

  const runMALSync = useCallback(() => {
    if (!items || !malLibrary || !malLinks) return
    setMalSyncing(true)
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
    Promise.all(pending).finally(() => setMalSyncing(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, malLibrary, malLinks])

  // Auto-sync on page load removed — user triggers sync manually via the Sync button.

  const [malAddingItemId, setMalAddingItemId]     = useState<number | null>(null)
  const [malUpdatingId,   setMalUpdatingId]       = useState<number | null>(null)
  const [malModalContext, setMalModalContext]      = useState<{ title: string; itemId: number } | null>(null)
  const [malModalResults, setMalModalResults]     = useState<MALSearchResult[]>([])
  const [malModalSearching, setMalModalSearching] = useState(false)

  // Inline confirmation state for destructive banner actions
  const [malConfirming, setMalConfirming] = useState<'sync' | 'clear' | 'disconnect' | null>(null)

  // ── IGDB integration (Video Games only) ─────────────────────────────────────
  const { data: igdbLinks }   = useIGDBLinks()
  const upsertIGDBLink        = useUpsertIGDBLink()
  const deleteIGDBLink        = useDeleteIGDBLink()
  const updateIGDBScore       = useUpdateIGDBScore()
  const searchIGDB            = useSearchIGDB()

  const [igdbModalContext,   setIgdbModalContext]   = useState<{ title: string; itemId: number } | null>(null)
  const [igdbModalResults,   setIgdbModalResults]   = useState<IGDBGame[]>([])
  const [igdbModalSearching, setIgdbModalSearching] = useState(false)
  const [igdbSyncing,        setIgdbSyncing]        = useState(false)
  const [igdbConfirming,     setIgdbConfirming]     = useState<'sync' | 'clear' | null>(null)

  const openIGDBModal = (title: string, itemId: number) => {
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
  }

  const clearAllIGDBLinks = useCallback(async () => {
    if (!igdbLinks || igdbLinks.size === 0) return
    // Optimistically clear UI immediately
    qc.setQueryData(['igdb-links'], new Map())
    // Single delete request for all IDs
    const ids = Array.from(igdbLinks.keys())
    await supabase.from('igdb_links').delete().in('analysis_item_id', ids)
    qc.invalidateQueries({ queryKey: ['igdb-links'] })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [igdbLinks, qc])

  const runIGDBSync = useCallback(async () => {
    if (!items || !igdbLinks) return
    setIgdbSyncing(true)
    try {
      // Collect unlinked items and their titles
      const unlinked = items
        .filter((item) => !igdbLinks.has(item.id))
        .map((item) => ({
          itemId: item.id,
          title:  String(item.item_data.game_title ?? item.item_data.title ?? '').trim(),
        }))
        .filter((x) => x.title)

      if (unlinked.length === 0) { setIgdbSyncing(false); return }

      // Single multiquery request — no rate-limit risk
      const { data, error } = await supabase.functions.invoke('igdb-proxy', {
        body: { action: 'batch-sync', titles: unlinked.map((x) => x.title) },
      })
      if (error) throw error
      if (data?.error) throw new Error(String(data.error))

      type BatchResult = { title: string; igdbId: number; igdbTitle: string; coverUrl: string | null; rating: number | null; genres: string[]; platforms: string[]; releaseYear: number | null }
      const matched = data as BatchResult[]

      if (matched.length === 0) { setIgdbSyncing(false); return }

      // Build a title → match lookup
      const byTitle = new Map(matched.map((m) => [m.title, m]))

      // Single bulk upsert — one Supabase request for all matched games
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

      // Apply all new links to the cache in one shot — no per-row flashing
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
    setIgdbSyncing(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, igdbLinks, qc])

  // ── TMDB integration (Movies + TV Series) ────────────────────────────────────
  const { data: tmdbLinks }   = useTMDBLinks()
  const upsertTMDBLink        = useUpsertTMDBLink()
  const deleteTMDBLink        = useDeleteTMDBLink()
  const updateTMDBScore       = useUpdateTMDBScore()
  const searchTMDB            = useSearchTMDB()

  const [tmdbModalContext,   setTmdbModalContext]   = useState<{ title: string; itemId: number } | null>(null)
  const [tmdbModalResults,   setTmdbModalResults]   = useState<TMDBTitle[]>([])
  const [tmdbModalSearching, setTmdbModalSearching] = useState(false)
  const [tmdbSyncing,        setTmdbSyncing]        = useState(false)
  const [tmdbConfirming,     setTmdbConfirming]     = useState<'sync' | 'clear' | null>(null)

  const openTMDBModal = (title: string, itemId: number) => {
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
  }

  const clearAllTMDBLinks = useCallback(async () => {
    if (!tmdbLinks || tmdbLinks.size === 0) return
    qc.setQueryData(['tmdb-links'], new Map())
    const ids = Array.from(tmdbLinks.keys())
    await supabase.from('tmdb_links').delete().in('analysis_item_id', ids)
    qc.invalidateQueries({ queryKey: ['tmdb-links'] })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbLinks, qc])

  const runTMDBSync = useCallback(async () => {
    if (!items || !tmdbLinks) return
    setTmdbSyncing(true)
    try {
      const titleKey = isMovies ? 'movie_title' : 'series_title'
      const unlinked = items
        .filter((item) => !tmdbLinks.has(item.id))
        .map((item) => ({
          itemId: item.id,
          title:  String(item.item_data[titleKey] ?? item.item_data.title ?? '').trim(),
        }))
        .filter((x) => x.title)

      if (unlinked.length === 0) { setTmdbSyncing(false); return }

      const { data, error } = await supabase.functions.invoke('tmdb-proxy', {
        body: { action: 'batch-sync', titles: unlinked.map((x) => x.title), mediaType: tmdbMediaType },
      })
      if (error) throw error
      if (data?.error) throw new Error(String(data.error))

      type BatchResult = { originalTitle: string; tmdbId: number; title: string; posterUrl: string | null; rating: number | null; genres: string[]; releaseYear: number | null; mediaType: 'movie' | 'tv' }
      const matched = data as BatchResult[]
      if (matched.length === 0) { setTmdbSyncing(false); return }

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

      const current = qc.getQueryData<Map<number, TMDBTitle>>(['tmdb-links']) ?? new Map()
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
        } as any)
      }
      qc.setQueryData(['tmdb-links'], next)
    } catch (e) {
      console.error('TMDB sync error:', e)
    }
    setTmdbSyncing(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tmdbLinks, isMovies, tmdbMediaType, qc])

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
    const base = buildColumns(category?.output_fields ?? [], hiddenKeys, handleLocationClick)

    if (isBoardGames) {
      base.push({
        id: '_bgg',
        header: 'BGG',
        accessorFn: (row) => String(row.item_data.game_name ?? ''),
        cell: ({ getValue }) => {
          const name = getValue() as string
          if (!name) return <span className="text-muted-foreground text-xs">—</span>
          const url = `https://boardgamegeek.com/geeksearch.php?action=search&q=${encodeURIComponent(name)}&objecttype=boardgame`
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline whitespace-nowrap"
            >
              BGG →
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
    if (isAnime && malAuth.isAuthenticated) {
      base.push(
        {
          id: '_mal_status',
          header: 'MAL Status',
          accessorFn: (row) => {
            const linkedId = malLinks?.get(row.id)
            return linkedId != null ? malLibrary?.byId.get(linkedId)?.status ?? null : null
          },
          cell: ({ row }) => {
            const title   = String(row.original.item_data.series_title ?? '')
            const itemId  = row.original.id
            const linkedId = malLinks?.get(itemId)
            const entry   = linkedId != null ? malLibrary?.byId.get(linkedId) : undefined

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
                  + Add to MAL
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
            const linkedId = malLinks?.get(row.id)
            return linkedId != null ? malLibrary?.byId.get(linkedId)?.score ?? null : null
          },
          cell: ({ row }) => {
            const itemId = row.original.id
            const linkedId = malLinks?.get(itemId)
            const entry  = linkedId != null ? malLibrary?.byId.get(linkedId) : undefined
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
                    <span key={g} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 leading-none whitespace-nowrap">
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
                    <span key={g} className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 leading-none whitespace-nowrap">
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

      return [
        ...(indexCol  ? [indexCol]  : []),
        tmdbCoverCol,
        ...dynCols,
        tmdbRatingCol,
        tmdbScoreCol,
        ...(sourceCol ? [sourceCol] : []),
      ]
    }

    return base
  }, [category?.output_fields, hiddenKeys, handleLocationClick, isBoardGames, isMtg, isAnime,
      isVideoGames, malAuth.isAuthenticated, malLibrary, malLinks, malAddingItemId, malUpdatingId,
      updateMALStatus, updateMALScore, searchMAL, deleteMALLink,
      igdbLinks, searchIGDB, deleteIGDBLink, updateIGDBScore,
      isTMDB, isMovies, tmdbLinks, deleteTMDBLink, updateTMDBScore])

  // Flag lookup for the dropdown
  const getOptionLabel = (value: string) => {
    if (singleGroupField === 'language') return `${getLanguageFlag(value)}  ${value}`
    if (hierarchyKey1 === 'country') return `${getCountryFlag(value)}  ${value}`
    return value
  }

  return (
    <div className="min-h-screen bg-background">
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

      <div className="max-w-7xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-8">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← All categories
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {categoryName}
          </h1>
          {category?.extraction_goal && (
            <p className="mt-1 text-muted-foreground">{category.extraction_goal}</p>
          )}
        </div>

        {/* MAL connect / disconnect banner */}
        {isAnime && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
            {malAuth.isAuthenticated ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Connected to <span className="font-medium text-foreground">MyAnimeList</span> — status and score are synced with your list.
                </p>
                <div className="flex items-center gap-3 shrink-0">
                  {/* Sync */}
                  {malConfirming === 'sync' ? (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-foreground font-medium">Sync with MAL?</span>
                      <button
                        onClick={() => { setMalConfirming(null); runMALSync() }}
                        className="text-violet-600 hover:text-violet-700 underline underline-offset-2 cursor-pointer"
                      >Confirm</button>
                      <button
                        onClick={() => setMalConfirming(null)}
                        className="text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer"
                      >Cancel</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setMalConfirming('sync')}
                      disabled={malSyncing || !malLibrary}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {malSyncing ? (
                        <>
                          <svg className="animate-spin h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Syncing…
                        </>
                      ) : 'Sync'}
                    </button>
                  )}

                  <span className="text-border">|</span>

                  {/* Clear links */}
                  {malConfirming === 'clear' ? (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-foreground font-medium">Clear all links?</span>
                      <button
                        onClick={() => { setMalConfirming(null); clearAllMALLinks() }}
                        className="text-destructive hover:text-destructive/80 underline underline-offset-2 cursor-pointer"
                      >Confirm</button>
                      <button
                        onClick={() => setMalConfirming(null)}
                        className="text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer"
                      >Cancel</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setMalConfirming('clear')}
                      disabled={!malLinks || malLinks.size === 0}
                      className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Clear links
                    </button>
                  )}

                  <span className="text-border">|</span>

                  {/* Disconnect */}
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
                <p className="text-xs text-muted-foreground">
                  Connect your <span className="font-medium text-foreground">MyAnimeList</span> account to track your watch status and scores.
                </p>
                <button
                  onClick={malAuth.login}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Connect MAL
                </button>
              </>
            )}
          </div>
        )}

        {/* IGDB sync banner */}
        {isVideoGames && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">IGDB</span> — cover art, community ratings, genres and platforms via the Internet Game Database.
            </p>
            <div className="flex items-center gap-3 shrink-0">
              {/* Sync */}
              {igdbConfirming === 'sync' ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-foreground font-medium">Sync with IGDB?</span>
                  <button
                    onClick={() => { setIgdbConfirming(null); runIGDBSync() }}
                    className="text-blue-600 hover:text-blue-700 underline underline-offset-2 cursor-pointer"
                  >Confirm</button>
                  <button
                    onClick={() => setIgdbConfirming(null)}
                    className="text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer"
                  >Cancel</button>
                </span>
              ) : (
                <button
                  onClick={() => setIgdbConfirming('sync')}
                  disabled={igdbSyncing}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {igdbSyncing ? (
                    <>
                      <svg className="animate-spin h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Syncing…
                    </>
                  ) : 'Sync all'}
                </button>
              )}

              <span className="text-border">|</span>

              {/* Clear links */}
              {igdbConfirming === 'clear' ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-foreground font-medium">Clear all links?</span>
                  <button
                    onClick={() => { setIgdbConfirming(null); clearAllIGDBLinks() }}
                    className="text-destructive hover:text-destructive/80 underline underline-offset-2 cursor-pointer"
                  >Confirm</button>
                  <button
                    onClick={() => setIgdbConfirming(null)}
                    className="text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer"
                  >Cancel</button>
                </span>
              ) : (
                <button
                  onClick={() => setIgdbConfirming('clear')}
                  disabled={!igdbLinks || igdbLinks.size === 0}
                  className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Clear links
                </button>
              )}
            </div>
          </div>
        )}

        {/* TMDB sync banner */}
        {isTMDB && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">TMDB</span> — poster art, community ratings and genres via The Movie Database.
            </p>
            <div className="flex items-center gap-3 shrink-0">
              {tmdbConfirming === 'sync' ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-foreground font-medium">Sync with TMDB?</span>
                  <button
                    onClick={() => { setTmdbConfirming(null); runTMDBSync() }}
                    className="text-rose-600 hover:text-rose-700 underline underline-offset-2 cursor-pointer"
                  >Confirm</button>
                  <button
                    onClick={() => setTmdbConfirming(null)}
                    className="text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer"
                  >Cancel</button>
                </span>
              ) : (
                <button
                  onClick={() => setTmdbConfirming('sync')}
                  disabled={tmdbSyncing}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {tmdbSyncing ? (
                    <>
                      <svg className="animate-spin h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Syncing…
                    </>
                  ) : 'Sync all'}
                </button>
              )}

              <span className="text-border">|</span>

              {tmdbConfirming === 'clear' ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-foreground font-medium">Clear all links?</span>
                  <button
                    onClick={() => { setTmdbConfirming(null); clearAllTMDBLinks() }}
                    className="text-destructive hover:text-destructive/80 underline underline-offset-2 cursor-pointer"
                  >Confirm</button>
                  <button
                    onClick={() => setTmdbConfirming(null)}
                    className="text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer"
                  >Cancel</button>
                </span>
              ) : (
                <button
                  onClick={() => setTmdbConfirming('clear')}
                  disabled={!tmdbLinks || tmdbLinks.size === 0}
                  className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Clear links
                </button>
              )}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col gap-3 mb-6">
          {/* Row 1: platform pills + group-by + search + map toggle */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Platform filter */}
            <div className="flex gap-2">
              {(['all', 'reddit', 'instagram'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setParam('platform', p === 'all' ? null : p)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    (p === 'all' && !platform) || platform === p
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            {/* Group-by dropdown */}
            {level1Options.length > 0 && (
              <div className="relative">
                <select
                  value={activeGroup}
                  onChange={(e) => { setParam('group', e.target.value); setFlyTarget(null) }}
                  className="appearance-none pl-3 pr-8 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
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
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ml-auto px-3 py-1.5 text-sm rounded-md border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-56"
            />

            {/* Map / Table toggle — only for hierarchical group_by categories */}
            {isHierarchical && (
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  onClick={() => setParam('view', 'table')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                    viewMode === 'table'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Table2 size={14} /> Table
                </button>
                <button
                  onClick={() => setParam('view', 'map')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                    viewMode === 'map'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted'
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
                { key: 'all',       label: 'All',              cls: 'border-border'                                                                                          },
                { key: 'untracked', label: 'Not Added',        cls: 'border-gray-300 data-[active]:bg-white data-[active]:text-gray-700'                                     },
                { key: '1',         label: 'Want to Read',     cls: 'border-blue-300 data-[active]:bg-blue-50 data-[active]:text-blue-700 data-[active]:border-blue-400'     },
                { key: '2',         label: 'Reading',          cls: 'border-yellow-300 data-[active]:bg-yellow-50 data-[active]:text-yellow-700 data-[active]:border-yellow-400' },
                { key: '3',         label: 'Read',             cls: 'border-green-300 data-[active]:bg-green-50 data-[active]:text-green-700 data-[active]:border-green-400' },
                { key: '4',         label: 'Did Not Finish',   cls: 'border-gray-400 data-[active]:bg-gray-200 data-[active]:text-gray-700 data-[active]:border-gray-500'    },
              ] as const).map(({ key, label, cls }) => {
                const active = statusFilter === key
                return (
                  <button
                    key={key}
                    data-active={active ? '' : undefined}
                    onClick={() => setStatusFilter(key)}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${cls} ${
                      active
                        ? key === 'all'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : ''
                        : 'bg-background text-muted-foreground hover:border-foreground/30'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* States */}
        {isLoading && <div className="text-muted-foreground">Loading…</div>}
        {error && <div className="text-destructive">Failed to load items.</div>}

        {/* Hierarchical: map — always mounted so flyTo works instantly from
            the table. Hidden with CSS when in table view. */}
        {cityGroups && (
          <div className={viewMode === 'map' ? '' : 'hidden'}>
            <Suspense fallback={<div className="text-muted-foreground">Loading map…</div>}>
              <TravelMap
              items={level1Items}
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
                    ? findHardcoverBook(hardcoverLibrary, title, hardcoverLinks?.get(item.id))
                    : undefined
                  if (statusFilter === 'untracked') return !book
                  if (!book) return false
                  return String(book.statusId) === statusFilter
                }
                return true
              })
              .map((item) => {
                const title  = String(item.item_data.book_title ?? '')
                const author = String(item.item_data.author ?? '')
                const book   = hardcoverLibrary
                  ? findHardcoverBook(hardcoverLibrary, title, hardcoverLinks?.get(item.id))
                  : undefined
                return (
                  <BookCard
                    key={item.id}
                    item={item}
                    book={book}
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
      </div>
    </div>
  )
}
