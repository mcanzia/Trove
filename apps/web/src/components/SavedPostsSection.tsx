import { useState, useMemo } from 'react'
import { ExternalLink, ChevronDown } from 'lucide-react'
import { usePostsByCategory } from '@/hooks/usePostsByCategory'
import type { CategoryPost, Platform } from '@trove/shared'

function snippet(p: CategoryPost): string {
  const t = (p.title || p.caption || '').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, 160) : '(no text)'
}

function PostLinkCard({ post }: { post: CategoryPost }) {
  const platformDot =
    post.platform === 'reddit'
      ? 'bg-orange-400'
      : 'bg-pink-400'

  return (
    <a
      href={post.url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition-all hover:border-ring/40 hover:shadow-sm"
    >
      {/* Platform dot + meta */}
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${platformDot}`} />
        <span className="truncate text-xs text-muted-foreground">
          {post.platform === 'reddit'
            ? post.owner ? `r/${post.owner}` : 'Reddit'
            : post.owner ? `@${post.owner}` : 'Instagram'}
        </span>
      </div>

      {/* Truncated title */}
      <p className="line-clamp-2 text-sm font-medium text-foreground leading-snug">
        {snippet(post)}
      </p>

      {/* External link */}
      <span className="mt-auto inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
        <ExternalLink size={12} /> Open original
      </span>
    </a>
  )
}

/**
 * Renders classified posts that produced NO extracted item as simple link-out
 * cards, so nothing saved is hidden. Collapsed by default.
 */
export function SavedPostsSection({
  categoryName,
  platform,
  surfacedPostIds,
}: {
  categoryName: string
  platform?: Platform
  surfacedPostIds: Set<string>
}) {
  const { data: posts } = usePostsByCategory({ categoryName, platform })
  const [open, setOpen] = useState(false)

  const thin = useMemo(
    () => (posts ?? []).filter((p) => !surfacedPostIds.has(p.post_id)),
    [posts, surfacedPostIds],
  )

  if (!thin.length) return null

  return (
    <div className="mt-10 border-t border-border pt-6">
      {/* Collapsible heading */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        aria-expanded={open}
      >
        <ChevronDown
          size={15}
          className={`text-muted-foreground transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
        <span>Saved posts without extracted highlights</span>
        {/* Count badge */}
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
          {thin.length}
        </span>
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in duration-150">
          {thin.map((p) => (
            <PostLinkCard key={p.post_id} post={p} />
          ))}
        </div>
      )}
    </div>
  )
}
