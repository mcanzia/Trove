import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useCategories } from '@/hooks/useCategories'
import { getCategoryTheme } from '@/lib/categoryConfig'
import { CATEGORY_GROUPS } from '@/lib/categoryGroups'
import { getRecents } from '@/lib/recents'
import { toSlug } from '@/lib/utils'
import { Kbd } from '@/components/ui/Kbd'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

/** Resolve a category name to its group label (for the right-aligned hint). */
function groupLabelFor(name: string): string {
  const group = CATEGORY_GROUPS.find((g) => g.categories.includes(name))
  return group?.label ?? 'More'
}

/**
 * The palette panel is mounted only while open, so all of its state
 * (query, selection, recents snapshot) initialises fresh on mount —
 * no reset-on-open effects needed.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  if (!open) return null
  return <PalettePanel onClose={onClose} />
}

function PalettePanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { data: categories } = useCategories()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Snapshot recents once per open (component mounts on open).
  const [recents] = useState<string[]>(() => getRecents())

  const names = useMemo(() => (categories ?? []).map((c) => c.name), [categories])

  // When empty, show recents (that still exist) followed by the full list;
  // otherwise substring-filter all.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      const existing = new Set(names)
      const recent = recents.filter((n) => existing.has(n))
      const recentSet = new Set(recent)
      return [...recent, ...names.filter((n) => !recentSet.has(n))]
    }
    return names.filter((n) => n.toLowerCase().includes(q))
  }, [query, names, recents])

  const recentCount = query.trim() === '' ? recents.filter((n) => names.includes(n)).length : 0

  // Focus the input after paint.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])

  // Keep the selected row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  function go(name: string) {
    onClose()
    navigate(`/category/${toSlug(name)}`)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => (results.length === 0 ? 0 : (s + 1) % results.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => (results.length === 0 ? 0 : (s - 1 + results.length) % results.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const name = results[selected]
      if (name) go(name)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-[20vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="max-w-lg w-full rounded-xl border bg-popover text-popover-foreground shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search size={16} className="text-muted-foreground shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
            }}
            placeholder="Search categories…"
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search categories"
          />
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No categories found.</p>
          ) : (
            results.map((name, index) => {
              const theme = getCategoryTheme(name)
              const Icon = theme.icon
              const active = index === selected
              const sectionLabel =
                recentCount > 0 && index === 0
                  ? 'Recent'
                  : recentCount > 0 && index === recentCount
                    ? 'All categories'
                    : null
              return (
                <div key={name}>
                  {sectionLabel && (
                    <p className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {sectionLabel}
                    </p>
                  )}
                  <button
                    type="button"
                    data-index={index}
                    onClick={() => go(name)}
                    onMouseEnter={() => setSelected(index)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                      active ? 'bg-accent text-accent-foreground' : ''
                    }`}
                  >
                    <Icon size={15} className={`${theme.iconClass} shrink-0`} aria-hidden />
                    <span className="truncate">{name}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{groupLabelFor(name)}</span>
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd>
            open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd>
            close
          </span>
        </div>
      </div>
    </div>
  )
}
