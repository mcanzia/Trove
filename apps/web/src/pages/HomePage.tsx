import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useCategories } from '@/hooks/useCategories'
import { useStats } from '@/hooks/useStats'
import { groupCategories } from '@/lib/categoryGroups'
import { getCategoryTheme } from '@/lib/categoryConfig'
import { toSlug } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Kbd } from '@/components/ui/Kbd'
import { SearchX } from 'lucide-react'

// ---------------------------------------------------------------------------
// Stat chip — shows skeleton while loading
// ---------------------------------------------------------------------------
interface StatChipProps {
  label: string
  value: number | undefined
  isLoading: boolean
}

function StatChip({ label, value, isLoading }: StatChipProps) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 flex flex-col gap-1 min-w-[120px]">
      {isLoading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <span className="font-display text-2xl tabular-nums text-foreground font-semibold">
          {value?.toLocaleString() ?? '—'}
        </span>
      )}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton card — used while categories are loading
// ---------------------------------------------------------------------------
function SkeletonCard() {
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// HomePage
// ---------------------------------------------------------------------------
export default function HomePage() {
  const { data: categories, isLoading: catsLoading, error: catsError } = useCategories()
  const { data: stats, isLoading: statsLoading } = useStats()

  const [filter, setFilter] = useState('')

  // Derive filtered + grouped data
  const filteredCategories = (categories ?? []).filter((cat) =>
    cat.name.toLowerCase().includes(filter.toLowerCase()),
  )

  const groups = groupCategories(filteredCategories)

  const showEmpty = !catsLoading && !catsError && filter.length > 0 && filteredCategories.length === 0

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* ------------------------------------------------------------------ */}
      {/* Header */}
      {/* ------------------------------------------------------------------ */}
      <header className="mb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
          Trove
        </h1>
        <p className="mt-2 text-muted-foreground">
          Your saved posts, organised and searchable.
        </p>

        {/* Stat chips */}
        <div className="mt-6 flex flex-wrap gap-3">
          <StatChip
            label="Items saved"
            value={stats?.total}
            isLoading={statsLoading}
          />
          <StatChip
            label="Categories"
            value={categories?.length}
            isLoading={catsLoading}
          />
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Filter input */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-8 relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          aria-hidden
        />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search categories…"
          className="w-full rounded-lg border bg-card pl-9 pr-16 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 transition-shadow"
          aria-label="Filter categories"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
          <Kbd>⌘K</Kbd>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Error state */}
      {/* ------------------------------------------------------------------ */}
      {catsError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load categories. Check your Supabase credentials.
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Loading state — skeleton grid */}
      {/* ------------------------------------------------------------------ */}
      {catsLoading && (
        <div className="space-y-10">
          {[6, 5, 4].map((count, gi) => (
            <section key={gi}>
              {/* Section label skeleton */}
              <div className="flex items-center gap-3 mb-4">
                <Skeleton className="h-3 w-24" />
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: count }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Empty filter result */}
      {/* ------------------------------------------------------------------ */}
      {showEmpty && (
        <EmptyState
          icon={SearchX}
          title="No categories match"
          description={`No categories found for "${filter}". Try a different search.`}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Category grid — grouped */}
      {/* ------------------------------------------------------------------ */}
      {!catsLoading && !catsError && !showEmpty && (
        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.label} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Section heading */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {group.label}
                </span>
                <div className="flex-1 h-px bg-border" aria-hidden />
              </div>

              {/* Cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {group.categories.map((cat) => {
                  const theme = getCategoryTheme(cat.name)
                  const Icon = theme.icon
                  const count = stats?.perCategory[cat.name]

                  return (
                    <Link
                      key={cat.id}
                      to={`/category/${toSlug(cat.name)}`}
                      className="group block"
                    >
                      <div
                        className={[
                          'h-full flex flex-col gap-3 p-4 rounded-xl border border-t-2 bg-card',
                          'transition-all duration-150 cursor-pointer',
                          'motion-safe:hover:-translate-y-0.5 hover:shadow-md hover:border-ring/40',
                          theme.accentClass,
                          theme.cardBgClass,
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-3">
                          {/* Icon tile */}
                          <div className={`p-2 rounded-lg shrink-0 ${theme.iconBgClass}`}>
                            <Icon size={16} className={theme.iconClass} aria-hidden />
                          </div>

                          {/* Name + count */}
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground leading-snug truncate">
                              {cat.name}
                            </p>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {statsLoading ? (
                                <Skeleton className="h-3 w-12 mt-1" />
                              ) : (
                                `${(count ?? 0).toLocaleString()} items`
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
