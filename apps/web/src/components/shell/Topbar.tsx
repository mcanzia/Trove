import { Link, useParams } from 'react-router-dom'
import { Menu, Search, Sun, Moon } from 'lucide-react'
import { useCategories } from '@/hooks/useCategories'
import { toSlug } from '@/lib/utils'
import { useTheme } from '@/components/shell/ThemeProvider'

interface TopbarProps {
  onOpenSidebar: () => void
  onOpenPalette: () => void
}

interface Crumb {
  label: string
  to?: string
}

export function Topbar({ onOpenSidebar, onOpenPalette }: TopbarProps) {
  const { slug, postId } = useParams()
  const { data: categories } = useCategories()
  const { resolved, toggle } = useTheme()

  const category = slug ? categories?.find((c) => toSlug(c.name) === slug) : undefined

  const crumbs: Crumb[] = [{ label: 'Trove', to: '/' }]
  if (slug) {
    const name = category?.name ?? slug
    crumbs.push({ label: name, to: postId ? `/category/${slug}` : undefined })
    if (postId) crumbs.push({ label: 'Recipe' })
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
      >
        <Menu size={18} aria-hidden />
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              {crumb.to && !isLast ? (
                <Link
                  to={crumb.to}
                  className="truncate text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={isLast ? 'truncate font-medium text-foreground' : 'truncate text-muted-foreground'}>
                  {crumb.label}
                </span>
              )}
            </span>
          )
        })}
      </nav>

      {/* Mobile-only controls (desktop has search + theme in the sidebar). */}
      <div className="ml-auto flex items-center gap-1 lg:hidden">
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Search"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search size={17} aria-hidden />
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {resolved === 'dark' ? <Moon size={17} aria-hidden /> : <Sun size={17} aria-hidden />}
        </button>
      </div>
    </header>
  )
}
