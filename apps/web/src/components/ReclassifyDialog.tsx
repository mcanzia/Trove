import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, X, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { useCategories } from '@/hooks/useCategories'
import { startReclassify, useJobById } from '@/hooks/useReclassify'
import { toSlug } from '@/lib/utils'
import type { Platform } from '@trove/shared'

export interface ReclassifyTarget {
  sourcePostId: string
  platform: Platform
  /** The category the user is reclassifying FROM (excluded from the picker). */
  currentCategory: string
  /** Short label for the post/highlight, shown in the dialog header. */
  label?: string
}

/**
 * Reclassify one saved post / highlight into another category. Enqueues a
 * reclassify job, polls it, and reports how many new highlights were added (or
 * that none were found). Additive — the post stays in its current category.
 */
export function ReclassifyDialog({
  target,
  onClose,
}: {
  target: ReclassifyTarget | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { data: categories } = useCategories()
  const [selected, setSelected] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const invalidated = useRef(false)

  const { data: job } = useJobById(jobId)

  // Reset everything whenever the dialog opens for a new target.
  useEffect(() => {
    setSelected('')
    setJobId(null)
    setSubmitting(false)
    setSubmitError(null)
    invalidated.current = false
  }, [target])

  const options = useMemo(
    () => (categories ?? [])
      .map((c) => c.name)
      .filter((name) => name !== target?.currentCategory)
      .sort((a, b) => a.localeCompare(b)),
    [categories, target?.currentCategory],
  )

  // Once the job lands new items, refresh the target category's caches so the
  // highlights show up without a manual reload.
  useEffect(() => {
    if (job?.status === 'succeeded' && job.counts?.added && !invalidated.current) {
      invalidated.current = true
      qc.invalidateQueries({ queryKey: ['analysis_items', selected] })
      qc.invalidateQueries({ queryKey: ['posts-by-category', selected] })
    }
  }, [job, qc, selected])

  if (!target) return null

  const running = !!jobId && (job == null || job.status === 'pending' || job.status === 'running')
  const succeeded = job?.status === 'succeeded'
  const failed = job?.status === 'failed'
  const added = job?.counts?.added ?? 0

  async function run() {
    if (!selected || !target) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const created = await startReclassify({
        sourcePostId: target.sourcePostId,
        platform: target.platform,
        targetCategory: selected,
      })
      setJobId(created.id)
    } catch (e) {
      setSubmitError(
        (e as Error).message === 'pending_approval'
          ? 'Your account needs owner approval before you can reclassify.'
          : "Couldn't start reclassify. Please try again.",
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
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Sparkles size={16} className="text-primary" /> Reclassify
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
              Re-analyze this post against another category and add any new highlights it
              finds. It stays in <span className="font-medium text-foreground">{target.currentCategory}</span>.
            </p>
            <label className="mb-1 block text-xs font-medium text-foreground">Target category</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Choose a category…</option>
              {options.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            {submitError && (
              <p className="mb-3 flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle size={13} /> {submitError}
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
                Reclassify
              </button>
            </div>
          </>
        )}

        {/* Running */}
        {running && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 size={28} className="animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">
              Analyzing this post for <span className="text-primary">{selected}</span>…
            </p>
            <p className="text-xs text-muted-foreground">
              This runs in the background and can take a minute or two.
            </p>
          </div>
        )}

        {/* Done — added items */}
        {succeeded && added > 0 && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 size={28} className="text-emerald-500" />
            <p className="text-sm font-medium text-foreground">
              Added {added} new highlight{added === 1 ? '' : 's'} to {selected}.
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

        {/* Done — nothing relevant found */}
        {succeeded && added === 0 && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertCircle size={28} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No new content found for {selected}.</p>
            <p className="text-xs text-muted-foreground">
              This post didn't have anything worthwhile for that category.
            </p>
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              Close
            </button>
          </div>
        )}

        {/* Failed */}
        {failed && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertCircle size={28} className="text-destructive" />
            <p className="text-sm font-medium text-foreground">Reclassify failed.</p>
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
