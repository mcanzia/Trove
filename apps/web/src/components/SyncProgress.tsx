import { CheckCircle2, Loader2, AlertTriangle } from 'lucide-react'
import type { SyncJob, JobPhase } from '@/hooks/useSyncJob'

const PHASES: { key: JobPhase; label: string }[] = [
  { key: 'fetch_saved', label: 'Fetch saved posts' },
  { key: 'fetch_comments', label: 'Fetch comments' },
  { key: 'classify', label: 'Classify' },
  { key: 'analyze', label: 'Analyze' },
  { key: 'sync', label: 'Save' },
  { key: 'done', label: 'Done' },
]

export function SyncProgress({ job }: { job: SyncJob }) {
  const failed = job.status === 'failed'
  const succeeded = job.status === 'succeeded'
  const currentIdx = PHASES.findIndex((p) => p.key === job.phase)

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        {failed ? (
          <><AlertTriangle size={16} className="text-red-500" /> Sync failed</>
        ) : succeeded ? (
          <><CheckCircle2 size={16} className="text-emerald-500" /> Sync complete</>
        ) : (
          <><Loader2 size={16} className="animate-spin text-gold" /> Syncing your Reddit saves…</>
        )}
      </div>

      {failed ? (
        <p className="text-sm text-red-600 dark:text-red-400">{job.error ?? 'Something went wrong.'}</p>
      ) : (
        <ol className="space-y-1.5">
          {PHASES.map((p, i) => {
            const done = succeeded || (currentIdx >= 0 && i < currentIdx)
            const active = !succeeded && i === currentIdx
            return (
              <li key={p.key} className="flex items-center gap-2 text-sm">
                {done ? (
                  <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                ) : active ? (
                  <Loader2 size={15} className="animate-spin text-gold shrink-0" />
                ) : (
                  <span className="h-[15px] w-[15px] shrink-0 rounded-full border border-muted-foreground/30" />
                )}
                <span className={done ? 'text-muted-foreground' : active ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                  {p.label}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {(job.counts.fetched != null || job.counts.analyzed != null) && (
        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          {job.counts.fetched != null && <span>{job.counts.fetched.toLocaleString()} saved posts</span>}
          {job.counts.analyzed != null && <span>{job.counts.analyzed.toLocaleString()} items extracted</span>}
        </div>
      )}
    </div>
  )
}
