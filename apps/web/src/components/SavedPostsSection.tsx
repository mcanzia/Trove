import { useState, useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import { usePostsByCategory } from '@/hooks/usePostsByCategory'
import type { CategoryPost, Platform } from '@trove/shared'

function snippet(p: CategoryPost): string {
  const t = (p.title || p.caption || '').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, 160) : '(no text)'
}

function PostLinkCard({ post }: { post: CategoryPost }) {
  const platformCls =
    post.platform === 'reddit'
      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
      : 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'
  return (
    <a
      href={post.url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/50"
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className={`rounded-full px-2 py-0.5 font-medium ${platformCls}`}>{post.platform}</span>
        {post.media_type && <span className="text-muted-foreground">{post.media_type}</span>}
        {post.owner && <span className="truncate text-muted-foreground">@{post.owner}</span>}
      </div>
      <p className="line-clamp-3 text-sm text-foreground">{snippet(post)}</p>
      <span className="mt-auto inline-flex items-center gap-1 text-xs text-primary group-hover:underline">
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
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-foreground transition-colors hover:text-primary"
      >
        {open ? '▾' : '▸'} {thin.length} more saved post{thin.length === 1 ? '' : 's'} without extracted highlights
      </button>
      {open && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {thin.map((p) => (
            <PostLinkCard key={p.post_id} post={p} />
          ))}
        </div>
      )}
    </div>
  )
}
