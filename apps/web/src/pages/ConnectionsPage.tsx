import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Link2, RefreshCw, AlertTriangle } from 'lucide-react'
import { useConnections, startRedditConnect } from '@/hooks/useConnections'
import { useSyncJob, enqueueSync, type SyncJob } from '@/hooks/useSyncJob'
import { SyncProgress } from '@/components/SyncProgress'

function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

export default function ConnectionsPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: connections, isLoading } = useConnections()
  const { data: job } = useSyncJob()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const handledReturn = useRef(false)

  const reddit = connections?.find((c) => c.platform === 'reddit')

  // Handle the OAuth return (?reddit=connected | ?reddit=error&reason=…).
  useEffect(() => {
    if (handledReturn.current) return
    const status = params.get('reddit')
    if (!status) return
    handledReturn.current = true

    if (status === 'connected') {
      qc.invalidateQueries({ queryKey: ['connections'] })
      enqueueSync()
        .then(() => qc.invalidateQueries({ queryKey: ['sync-job', 'latest'] }))
        .catch((e) => setError(e instanceof Error ? e.message : 'Failed to start sync'))
    } else if (status === 'error') {
      setError(`Reddit connection failed (${params.get('reason') ?? 'unknown'}). Please try again.`)
    }
    navigate('/connections', { replace: true })  // clear the query string
  }, [params, navigate, qc])

  const connect = async () => {
    setError(null); setBusy(true)
    try { await startRedditConnect() } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start connect'); setBusy(false)
    }
  }

  const syncNow = async () => {
    setError(null); setBusy(true)
    try {
      await enqueueSync()
      qc.invalidateQueries({ queryKey: ['sync-job', 'latest'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start sync')
    } finally { setBusy(false) }
  }

  const jobActive = job && (job.status === 'pending' || job.status === 'running')
  const showJob: SyncJob | null = job ?? null

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl font-semibold text-foreground">Connections</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Link your accounts to sync and analyze your own saved posts.
      </p>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Reddit */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium">Reddit</div>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : reddit && reddit.status === 'connected' ? (
              <div className="text-sm text-muted-foreground">
                Connected as <span className="text-foreground">u/{reddit.reddit_username}</span> · last synced {relTime(reddit.last_synced_at)}
              </div>
            ) : reddit && reddit.status === 'revoked' ? (
              <div className="text-sm text-amber-600 dark:text-amber-400">Access revoked — reconnect to resume syncing.</div>
            ) : (
              <div className="text-sm text-muted-foreground">Not connected.</div>
            )}
          </div>
          {reddit && reddit.status === 'connected' ? (
            <button
              type="button" onClick={syncNow} disabled={busy || !!jobActive}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw size={14} className={jobActive ? 'animate-spin' : undefined} /> {jobActive ? 'Syncing…' : 'Sync now'}
            </button>
          ) : (
            <button
              type="button" onClick={connect} disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-sm font-medium text-gold-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Link2 size={14} /> {reddit?.status === 'revoked' ? 'Reconnect' : 'Connect Reddit'}
            </button>
          )}
        </div>
      </div>

      {showJob && (job?.status !== 'succeeded' || jobActive) && (
        <div className="mt-4">
          <SyncProgress job={showJob} />
        </div>
      )}

      {/* Instagram (deferred) */}
      <div className="mt-4 rounded-xl border bg-card p-4 opacity-60">
        <div className="font-medium">Instagram</div>
        <div className="text-sm text-muted-foreground">Coming soon — via Instagram data export upload.</div>
      </div>
    </div>
  )
}
