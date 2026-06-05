import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { StarRating } from '@/components/StarRating'
import { HARDCOVER_STATUS, type HardcoverBook, type HardcoverLinkData } from '@/hooks/useHardcoverBooks'
import type { AnalysisItem } from '@/types'

interface BookCardProps {
  item:              AnalysisItem
  book?:             HardcoverBook
  hcLink?:           HardcoverLinkData  // enrichment: cover, community rating, genres
  isAdding:          boolean   // spinner while add+link mutations are in flight
  isSearching:       boolean   // searching… while modal opens
  isUpdatingStatus:  boolean   // pulse while status mutation is in flight
  onAddClick:        () => void
  onRatingChange:    (rating: number | null) => void
  onStatusChange:    (statusId: number) => void
}

export function BookCard({
  item,
  book,
  hcLink,
  isAdding,
  isSearching,
  isUpdatingStatus,
  onAddClick,
  onRatingChange,
  onStatusChange,
}: BookCardProps) {
  const [expanded, setExpanded] = useState(false)

  const title      = String(item.item_data.book_title  ?? '')
  const author     = String(item.item_data.author      ?? '')
  const genre      = String(item.item_data.genre       ?? '')
  const whyReadIt  = String(item.item_data.why_read_it ?? '')
  const sourceUrl  = item.posts?.url ?? null
  const platform   = item.platform
  const addedDate  = item.item_data._first_added
    ? String(item.item_data._first_added).slice(0, 10)
    : item.created_at.slice(0, 10)

  const coverUrl          = hcLink?.coverUrl ?? null
  const communityRating   = hcLink?.hcCommunityRating ?? null
  // Prefer genres from hcLink (Hardcover data); fall back to item_data genre string
  const displayGenres     = hcLink?.genres?.length
    ? hcLink.genres.slice(0, 3)
    : genre ? [genre] : []

  const TRUNCATE_AT = 120
  const isTruncatable = whyReadIt.length > TRUNCATE_AT
  const displayedWhy = expanded || !isTruncatable
    ? whyReadIt
    : whyReadIt.slice(0, TRUNCATE_AT).trimEnd() + '…'

  const statusBg = isAdding
    ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'
    : !book
    ? 'bg-white border-border dark:bg-card'
    : book.statusId === 3
    ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'      // Read
    : book.statusId === 4
    ? 'bg-gray-200 border-gray-300 dark:bg-gray-800/60 dark:border-gray-600'          // Did not finish
    : book.statusId === 1
    ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'          // Want to read
    : book.statusId === 2
    ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800'  // Reading
    : 'bg-white border-border dark:bg-card'

  return (
    <div className={`flex flex-col gap-3 rounded-xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden ${statusBg}`}>

      {/* Cover image (full-width banner if available) */}
      {coverUrl && (
        <div className="w-full aspect-[3/2] overflow-hidden bg-muted">
          <img
            src={coverUrl}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="flex flex-col gap-3 p-4 pt-3">

      {/* Title + date */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground leading-snug">{title}</h3>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">{addedDate}</span>
      </div>

      {/* Author + genre tags */}
      <div className="flex items-center gap-2 flex-wrap">
        {author && <span className="text-xs text-muted-foreground">{author}</span>}
        {displayGenres.map((g) => (
          <span key={g} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
            {g}
          </span>
        ))}
      </div>

      {/* Community rating from Hardcover */}
      {communityRating != null && (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Community</span>
          <span className="text-[11px] font-semibold text-foreground tabular-nums">
            {communityRating.toFixed(1)}
          </span>
          <span className="text-[10px] text-yellow-500">★</span>
          <span className="text-[10px] text-muted-foreground">/ 5</span>
        </div>
      )}

      {/* Hardcover row */}
      <div className="flex items-center gap-3 pt-0.5">
        {isAdding ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <svg className="animate-spin h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Adding…
          </span>
        ) : !book ? (
          <button
            disabled={isSearching}
            onClick={onAddClick}
            className="text-xs cursor-pointer text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSearching ? 'Searching…' : '+ Add to Hardcover'}
          </button>
        ) : (
          <>
            <StarRating value={book.rating} onChange={onRatingChange} />
            <div className="h-3 w-px bg-border" />
            {isUpdatingStatus ? (
              <span className="text-xs text-muted-foreground animate-pulse">
                {HARDCOVER_STATUS[book.statusId] ?? '…'}
              </span>
            ) : (
              <select
                value={book.statusId}
                onChange={(e) => onStatusChange(Number(e.target.value))}
                className="text-xs bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground focus:outline-none"
              >
                {Object.entries(HARDCOVER_STATUS).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            )}
          </>
        )}
      </div>

      {/* Why read it */}
      {whyReadIt && (
        <div className="pt-0.5">
          <p className="text-xs text-muted-foreground leading-relaxed">{displayedWhy}</p>
          {isTruncatable && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 flex items-center gap-0.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
            >
              {expanded ? <><ChevronUp size={11} /> Show less</> : <><ChevronDown size={11} /> Show more</>}
            </button>
          )}
        </div>
      )}

      {/* Footer: platform + source */}
      <div className="flex items-center gap-2 mt-auto pt-1 border-t border-black/10 dark:border-white/10">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
          platform === 'reddit'
            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
            : 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'
        }`}>
          {platform}
        </span>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-primary hover:underline ml-auto"
          >
            {platform === 'reddit' ? 'Reddit →' : 'Instagram →'}
          </a>
        )}
      </div>

      </div>{/* end padded content */}
    </div>
  )
}
