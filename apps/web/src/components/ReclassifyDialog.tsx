import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, X, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { useCategories } from '@/hooks/useCategories'
import { startReclassify, commitReclassify, useJobById } from '@/hooks/useReclassify'
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
 * Reclassify one saved post / highlight into another category, with review.
 * Flow: pick a category → a job extracts candidate highlights → you choose which
 * to add → the selected ones are committed. Additive — the post stays in its
 * current category.
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

  // Candidate-selection / commit state
  const [picked, setPicked] = useState<Set<number> | null>(null)
  const [committing, setCommitting] = useState(false)
  const [committedCount, setCommittedCount] = useState<number | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)

  const { data: job } = useJobById(jobId)

  // Reset everything whenever the dialog opens for a new target.
  useEffect(() => {
    setSelected('')
    setJobId(null)
    setSubmitting(false)
    setSubmitError(null)
    setPicked(null)
    setCommitting(false)
    setCommittedCount(null)
    setCommitError(null)
  }, [target])

  const categoryOptions = useMemo(
    () => (categories ?? [])
      .map((c) => c.name)
      .filter((name) => name !== target?.currentCategory)
      .sort((a, b) => a.localeCompare(b)),
    [categories, target?.currentCategory],
  )

  const candidates = useMemo(() => job?.result?.candidates ?? [], [job])
  const succeeded = job?.status === 'succeeded'
  const failed = job?.status === 'failed'
  const running = !!jobId && !succeeded && !failed

  // Pre-check all candidates once they arrive.
  useEffect(() => {
    if (succeeded && candidates.length && picked === null) {
      setPicked(new Set(candidates.map((_, i) => i)))
    }
  }, [succeeded, candidates, picked])

  // Fields of the target category, for rendering candidate titles/subtitles.
  const targetFields = useMemo(
    () => (categories ?? []).find((c) => c.name === selected)?.output_fields ?? [],
    [categories, selected],
  )
  const titleKey = targetFields[0]?.key
  const subtitleKeys = targetFields.slice(1, 3).map((f) => f.key)

  if (!target) return null

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

  function toggle(i: number) {
    setPicked((prev) => {
      const next = new Set(prev ?? [])
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  async function commit() {
    if (!jobId || !picked || picked.size === 0) return
    setCommitting(true)
    setCommitError(null)
    try {
      const { added } = await commitReclassify(jobId, [...picked].sort((a, b) => a - b))
      setCommittedCount(added)
      qc.invalidateQueries({ queryKey: ['analysis_items', selected] })
      qc.invalidateQueries({ queryKey: ['posts-by-category', selected] })
      // The post now has a highlight, so it drops out of the "saved posts without
      // extracted highlights" backlog — refresh the category we reclassified FROM.
      if (added > 0 && target) {
        qc.invalidateQueries({ queryKey: ['posts-by-category', target.currentCategory] })
      }
    } catch {
      setCommitError("Couldn't add the selected highlights. Please try again.")
    } finally {
      setCommitting(false)
    }
  }

  const pickCount = picked?.size ?? 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-border bg-card p-5 shadow-lg"
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
              Analyze this post against another category, then choose which highlights to add. It
              stays in <span className="font-medium text-foreground">{target.currentCategory}</span>.
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
                Analyze
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

        {/* Committed — added items */}
        {committedCount !== null && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 size={28} className="text-emerald-500" />
            <p className="text-sm font-medium text-foreground">
              {committedCount > 0
                ? `Added ${committedCount} highlight${committedCount === 1 ? '' : 's'} to ${selected}.`
                : `Nothing added to ${selected}.`}
            </p>
            <div className="flex gap-2">
              {committedCount > 0 && (
                <Link
                  to={`/category/${toSlug(selected)}`}
                  onClick={onClose}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  View {selected} →
                </Link>
              )}
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Succeeded — choose candidates */}
        {succeeded && committedCount === null && candidates.length > 0 && (
          <>
            <p className="mb-2 text-sm text-muted-foreground">
              Found {candidates.length} possible highlight{candidates.length === 1 ? '' : 's'} for{' '}
              <span className="font-medium text-foreground">{selected}</span>. Choose which to add:
            </p>
            <div className="-mx-1 mb-3 flex-1 overflow-y-auto px-1">
              {candidates.map((cand, i) => {
                const title = (titleKey && String(cand[titleKey] ?? '')) || `Item ${i + 1}`
                const subtitle = subtitleKeys
                  .map((k) => cand[k])
                  .filter((v) => v != null && String(v).trim() !== '')
                  .map((v) => String(v))
                  .join(' · ')
                return (
                  <label
                    key={i}
                    className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
                  >
                    <input
                      type="checkbox"
                      checked={picked?.has(i) ?? false}
                      onChange={() => toggle(i)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{title}</div>
                      {subtitle && (
                        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>

            {commitError && (
              <p className="mb-3 flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle size={13} /> {commitError}
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() =>
                  setPicked((prev) =>
                    prev && prev.size === candidates.length
                      ? new Set()
                      : new Set(candidates.map((_, i) => i)),
                  )
                }
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {pickCount === candidates.length ? 'Deselect all' : 'Select all'}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={commit}
                  disabled={pickCount === 0 || committing}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {committing && <Loader2 size={14} className="animate-spin" />}
                  Add selected ({pickCount})
                </button>
              </div>
            </div>
          </>
        )}

        {/* Succeeded — nothing relevant found */}
        {succeeded && committedCount === null && candidates.length === 0 && (
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
