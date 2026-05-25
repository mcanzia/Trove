import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useState, useMemo, useRef, useCallback, useEffect, lazy, Suspense } from 'react'
import { toSlug } from '@/lib/utils'
import { type ColumnDef } from '@tanstack/react-table'

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

  // ── Hardcover integration (Books Worth Reading only) ──────────────────────
  const isBooks = categoryName === 'Books Worth Reading'
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

  const columns = useMemo(
    () => buildColumns(category?.output_fields ?? [], hiddenKeys, handleLocationClick),
    [category?.output_fields, hiddenKeys, handleLocationClick],
  )

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
