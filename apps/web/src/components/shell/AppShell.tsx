import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ThemeProvider } from '@/components/shell/ThemeProvider'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { CommandPalette } from '@/components/shell/CommandPalette'

function ShellInner() {
  // The drawer remembers the path it was opened on, so a route change
  // closes it by derivation (no setState-in-effect needed).
  const [drawerOpenedAt, setDrawerOpenedAt] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const location = useLocation()
  const drawerOpen = drawerOpenedAt === location.pathname

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const openDrawer = useCallback(() => setDrawerOpenedAt(location.pathname), [location.pathname])
  const closeDrawer = useCallback(() => setDrawerOpenedAt(null), [])

  // Global ⌘K / Ctrl+K toggles the palette.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // ESC closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen, closeDrawer])

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-sidebar-border lg:block">
        <Sidebar onOpenPalette={openPalette} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={closeDrawer}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-[264px] border-r border-sidebar-border shadow-2xl animate-in slide-in-from-left duration-200">
            <Sidebar onOpenPalette={openPalette} onNavigate={closeDrawer} />
          </div>
        </div>
      )}

      <div className="lg:pl-[264px]">
        <Topbar onOpenSidebar={openDrawer} onOpenPalette={openPalette} />
        {/* Pages own their containers (max-width + padding). */}
        <main>
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  )
}

export function AppShell() {
  return (
    <ThemeProvider>
      <ShellInner />
    </ThemeProvider>
  )
}
