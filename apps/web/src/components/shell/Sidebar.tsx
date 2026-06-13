import { Link, useLocation } from 'react-router-dom'
import { Gem, Search, Sun, Moon, Gauge } from 'lucide-react'
import { useCategories } from '@/hooks/useCategories'
import { useStats } from '@/hooks/useStats'
import { getCategoryTheme } from '@/lib/categoryConfig'
import { groupCategories } from '@/lib/categoryGroups'
import { toSlug } from '@/lib/utils'
import { useTheme } from '@/components/shell/ThemeProvider'
import { Kbd } from '@/components/ui/Kbd'

interface SidebarProps {
  /** Open the command palette (search button). */
  onOpenPalette: () => void
  /** Called after a nav item is clicked (mobile: close the drawer). */
  onNavigate?: () => void
}

export function Sidebar({ onOpenPalette, onNavigate }: SidebarProps) {
  const { data: categories } = useCategories()
  const { data: stats, isLoading: statsLoading } = useStats()
  const { resolved, toggle } = useTheme()
  const location = useLocation()

  const groups = categories ? groupCategories(categories) : []
  const activeSlug = location.pathname.startsWith('/category/')
    ? location.pathname.split('/')[2]
    : undefined

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-soft">
            <Gem size={17} className="text-gold" aria-hidden />
          </span>
          <span className="font-display text-lg font-semibold">Trove</span>
        </Link>

        <button
          type="button"
          onClick={onOpenPalette}
          className="mt-3 flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Search size={15} className="shrink-0" aria-hidden />
          <span>Search…</span>
          <Kbd className="ml-auto">⌘K</Kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            {group.categories.map((cat) => {
              const theme = getCategoryTheme(cat.name)
              const Icon = theme.icon
              const slug = toSlug(cat.name)
              const active = slug === activeSlug
              const count = stats?.perCategory[cat.name]
              return (
                <Link
                  key={cat.id}
                  to={`/category/${slug}`}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-2.5 rounded-md py-1.5 pl-3 pr-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'hover:bg-sidebar-accent/60'
                  }`}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gold"
                      aria-hidden
                    />
                  )}
                  <Icon size={15} className={`${theme.iconClass} shrink-0`} aria-hidden />
                  <span className="truncate">{cat.name}</span>
                  {!statsLoading && count != null && (
                    <span className="ml-auto text-[10px] tabular-nums text-muted-foreground animate-in fade-in duration-300">
                      {count}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-4 py-3">
        <span className="text-[11px] text-muted-foreground">
          {stats ? `${stats.total.toLocaleString()} items saved` : ''}
        </span>
        <div className="flex items-center gap-1">
          <Link
            to="/admin"
            onClick={onNavigate}
            aria-label="AI usage dashboard"
            aria-current={location.pathname === '/admin' ? 'page' : undefined}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
              location.pathname === '/admin' ? 'text-gold' : 'text-muted-foreground'
            }`}
          >
            <Gauge size={16} aria-hidden />
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {resolved === 'dark' ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  )
}
