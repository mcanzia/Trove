import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, AlertTriangle, Plug, Trash2, ChevronDown } from 'lucide-react'
import { useConnections, saveRedditCredential, disconnectReddit } from '@/hooks/useConnections'
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

/** Collapsible "how to grab your cookie" instructions. */
function CookieHelp() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 rounded-lg border bg-muted/30">
      <button
        type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium"
      >
        How do I get my Reddit cookie?
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="list-decimal space-y-1.5 px-3 pb-3 pl-7 text-sm text-muted-foreground">
          <li>Open <span className="text-foreground">reddit.com</span> in your browser, logged in.</li>
          <li>Open DevTools (<span className="text-foreground">F12</span> or right-click → Inspect) → <span className="text-foreground">Network</span> tab.</li>
          <li>Reload the page, click the first request to <span className="text-foreground">reddit.com</span>.</li>
          <li>Under <span className="text-foreground">Request Headers</span>, find <span className="text-foreground">cookie:</span> and copy its entire value.</li>
          <li>Paste it below. It’s encrypted at rest and only used to fetch your saves.</li>
        </ol>
      )}
    </div>
  )
}

export default function ConnectionsPage() {
  const qc = useQueryClient()
  const { data: connections, isLoading } = useConnections()
  const { data: job } = useSyncJob()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [username, setUsername] = useState('')
  const [cookie, setCookie] = useState('')

  const reddit = connections?.find((c) => c.platform === 'reddit')
  const connected = reddit?.status === 'connected'
  const jobActive = job && (job.status === 'pending' || job.status === 'running')
  const showJob: SyncJob | null = job ?? null

  const save = async () => {
    setError(null); setBusy(true)
    try {
      await saveRedditCredential(cookie.trim(), username.trim())
      setCookie('')
      await qc.invalidateQueries({ queryKey: ['connections'] })
      await enqueueSync()
      qc.invalidateQueries({ queryKey: ['sync-job', 'latest'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect')
    } finally { setBusy(false) }
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

  const disconnect = async () => {
    setError(null); setBusy(true)
    try {
      await disconnectReddit()
      qc.invalidateQueries({ queryKey: ['connections'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect')
    } finally { setBusy(false) }
  }

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
            ) : connected ? (
              <div className="text-sm text-muted-foreground">
                Connected as <span className="text-foreground">u/{reddit!.reddit_username}</span> · last synced {relTime(reddit!.last_synced_at)}
              </div>
            ) : reddit?.status === 'revoked' ? (
              <div className="text-sm text-amber-600 dark:text-amber-400">Your cookie expired — paste a fresh one to resume syncing.</div>
            ) : (
              <div className="text-sm text-muted-foreground">Not connected.</div>
            )}
          </div>
          {connected && (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button" onClick={syncNow} disabled={busy || !!jobActive}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw size={14} className={jobActive ? 'animate-spin' : undefined} /> {jobActive ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                type="button" onClick={disconnect} disabled={busy} aria-label="Disconnect Reddit"
                className="inline-flex items-center justify-center rounded-lg border p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Paste-in form (shown when not connected, or when the cookie expired) */}
        {!isLoading && !connected && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="reddit-username">Reddit username</label>
              <input
                id="reddit-username" type="text" value={username} placeholder="your_username"
                onChange={(e) => setUsername(e.target.value)} autoComplete="off" spellCheck={false}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="reddit-cookie">Reddit cookie</label>
              <textarea
                id="reddit-cookie" value={cookie} rows={3} placeholder="Paste your reddit.com cookie header value…"
                onChange={(e) => setCookie(e.target.value)} spellCheck={false}
                className="w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <CookieHelp />
            <button
              type="button" onClick={save} disabled={busy || !cookie.trim() || !username.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-sm font-medium text-gold-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plug size={14} /> {busy ? 'Verifying…' : 'Connect & sync'}
            </button>
          </div>
        )}
      </div>

      {showJob && (job?.status !== 'succeeded' || jobActive) && (
        <div className="mt-4">
          <SyncProgress job={showJob} />
        </div>
      )}

      {/* Instagram (deferred) */}
      <div className="mt-4 rounded-xl border bg-card p-4 opacity-60">
        <div className="font-medium">Instagram</div>
        <div className="text-sm text-muted-foreground">Coming soon — paste your Instagram session, same as Reddit.</div>
      </div>
    </div>
  )
}
