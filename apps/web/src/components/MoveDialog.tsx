import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, X, ArrowRightLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { useCategories } from '@/hooks/useCategories'
import { startMove, useJobById } from '@/hooks/useReclassify'
import { toSlug } from '@/lib/utils'

export interface MoveTarget {
  analysisItemId: number
  /** The category the item is currently in (excluded from the picker). */
  currentCategory: string
  /** Short label for the item, shown in the dialog header. */
  label?: string
}

/**
 * Move one already-extracted item into a different category. The worker re-maps
 * its fields to the target schema, links the post, removes the original, and
 * enqueues the target's enrichment. Unlike reclassify this is a true move.
 */
export function MoveDialog({
  target,
  onClose,
}: {
  target: MoveTarget | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { data: categories } = useCategories()
  const [selected, setSelected] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: job } = useJobById(jobId)

  useEffect(() => {
    setSelected('')
    setJobId(null)
    setSubmitting(false)
    setError(null)
  }, [target])

  const categoryOptions = useMemo(
    () => (categories ?? [])
      .map((c) => c.name)
      .filter((name) => name !== target?.currentCategory)
      .sort((a, b) => a.localeCompare(b)),
    [categories, target?.currentCategory],
  )

  const succeeded = job?.status === 'succeeded'
  const failed = job?.status === 'failed'
  const running = !!jobId && !succeeded && !failed

  // On success, refresh both the source and target category views.
  useEffect(() => {
    if (succeeded && target) {
      qc.invalidateQueries({ queryKey: ['analysis_items', target.currentCategory] })
      qc.invalidateQueries({ queryKey: ['analysis_items', selected] })
      qc.invalidateQueries({ queryKey: ['posts-by-category', target.currentCategory] })
      qc.invalidateQueries({ queryKey: ['posts-by-category', selected] })
    }
  }, [succeeded, target, selected, qc])

  if (!target) return null

  async function run() {
    if (!selected || !target) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await startMove({
        analysisItemId: target.analysisItemId,
        targetCategory: selected,
      })
      setJobId(created.id)
    } catch (e) {
      const msg = (e as Error).message
      setError(
        msg === 'pending_approval'
          ? 'Your account needs owner approval before you can move items.'
          : msg === 'already in that category'
            ? 'That item is already in this category.'
            : "Couldn't start the move. Please try again.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col rounded-xl border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <ArrowRightLeft size={16} className="text-primary" /> Move to category
            </h2>
            {target.label && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{target.label}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Idle / picking a category */}
        {!jobId && (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              Move this entry out of{' '}
              <span className="font-medium text-foreground">{target.currentCategory}</span> and
              re-file it under the right category. Its fields and cover are re-fetched for the target.
            </p>
            <label className="mb-1 block text-xs font-medium text-foreground">Target category</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Choose a category…</option>
              {categoryOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            {error && (
              <p className="mb-3 flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle size={13} /> {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={run}
                disabled={!selected || submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Move
              </button>
            </div>
          </>
        )}

        {/* Running */}
        {running && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 size={28} className="animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">
              Moving to <span className="text-primary">{selected}</span>…
            </p>
            <p className="text-xs text-muted-foreground">
              This runs in the background and can take a minute.
            </p>
          </div>
        )}

        {/* Succeeded */}
        {succeeded && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 size={28} className="text-emerald-500" />
            <p className="text-sm font-medium text-foreground">
              Moved to {selected}.
            </p>
            <div className="flex gap-2">
              <Link
                to={`/category/${toSlug(selected)}`}
                onClick={onClose}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                View {selected} →
              </Link>
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Failed */}
        {failed && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertCircle size={28} className="text-destructive" />
            <p className="text-sm font-medium text-foreground">Move failed.</p>
            <p className="text-xs text-muted-foreground">{job?.error ?? 'Please try again.'}</p>
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
