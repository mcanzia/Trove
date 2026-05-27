import { useState, useRef, useEffect } from 'react'
import { X, Search, Star } from 'lucide-react'
import type { TMDBTitle } from '@/hooks/useTMDB'

interface Props {
  initialQuery: string
  mediaType:    'movie' | 'tv'
  results:      TMDBTitle[]
  isSearching:  boolean
  onSearch:     (query: string) => void
  onSelect:     (result: TMDBTitle) => void
  onClose:      () => void
}

export function TMDBSearchModal({
  initialQuery,
  mediaType,
  results,
  isSearching,
  onSearch,
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState(initialQuery)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSearch = () => { if (query.trim()) onSearch(query.trim()) }
  const label = mediaType === 'tv' ? 'TV series' : 'movie'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-sm font-semibold text-foreground">Link to TMDB</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Search input */}
        <div className="px-5 pb-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={`Search ${label} title…`}
              className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
              className="px-3 py-2 rounded-lg bg-foreground text-background text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80 transition-opacity flex items-center gap-1.5"
            >
              <Search size={14} />
              {isSearching ? 'Searching…' : 'Search'}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 px-5 pb-5 flex flex-col gap-2">
          {results.length === 0 && !isSearching && (
            <p className="text-xs text-muted-foreground text-center py-6">
              No results yet — try searching above
            </p>
          )}
          {results.map((result) => (
            <button
              key={result.tmdbId}
              onClick={() => onSelect(result)}
              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-foreground/30 hover:bg-muted/40 transition-all text-left cursor-pointer"
            >
              {/* Poster */}
              <div className="w-10 h-14 rounded overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center">
                {result.posterUrl ? (
                  <img src={result.posterUrl} alt={result.title} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-muted-foreground text-[10px] text-center px-1 leading-tight">No image</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug line-clamp-1">
                  {result.title}
                </p>
                <div className="flex items-center flex-wrap gap-1.5 mt-1">
                  {result.releaseYear && (
                    <span className="text-[10px] text-muted-foreground">{result.releaseYear}</span>
                  )}
                  {result.rating != null && (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      <Star size={9} className="fill-current" />
                      {result.rating.toFixed(1)}
                    </span>
                  )}
                  {result.genres.slice(0, 3).map((g) => (
                    <span key={g} className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 font-medium">
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
