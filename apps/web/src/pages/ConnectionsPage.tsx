import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, AlertTriangle, Plug, Trash2, ChevronDown } from 'lucide-react'
import {
  useConnections, saveRedditCredential, saveInstagramCredential,
  disconnectReddit, disconnectInstagram, type Connection,
} from '@/hooks/useConnections'
import { useSyncJob, enqueueSync, type Platform, type SyncJob } from '@/hooks/useSyncJob'
import { SyncProgress } from '@/components/SyncProgress'
import { useAccess } from '@/hooks/useAccess'
import { Clock, Ban } from 'lucide-react'

function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

function Help({ title, steps }: { title: string; steps: React.ReactNode[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border bg-muted/30">
      <button
        type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium"
      >
        {title}
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="list-decimal space-y-1.5 px-3 pb-3 pl-7 text-sm text-muted-foreground">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
    </div>
  )
}

interface CardConfig {
  platform: Platform
  label: string
  experimental?: boolean
  credLabel: string
  credPlaceholder: string
  userLabel: string
  userPlaceholder: string
  /** Normalize the typed username (strip @, u/, etc.) for display parity. */
  save: (cred: string, username: string) => Promise<void>
  disconnect: () => Promise<void>
  helpTitle: string
  helpSteps: React.ReactNode[]
}

function PlatformCard({ cfg, connection }: { cfg: CardConfig; connection?: Connection }) {
  const qc = useQueryClient()
  const { data: job } = useSyncJob(cfg.platform)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [username, setUsername] = useState('')
  const [cred, setCred] = useState('')

  const connected = connection?.status === 'connected'
  const jobActive = job && (job.status === 'pending' || job.status === 'running')
  const showJob: SyncJob | null = job ?? null

  const refreshConns = () => qc.invalidateQueries({ queryKey: ['connections'] })
  const refreshJob = () => qc.invalidateQueries({ queryKey: ['sync-job', 'latest', cfg.platform] })

  const save = async () => {
    setError(null); setBusy(true)
    try {
      await cfg.save(cred.trim(), username.trim())
      setCred('')
      await refreshConns()
      await enqueueSync(cfg.platform)
      refreshJob()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect')
    } finally { setBusy(false) }
  }

  const syncNow = async () => {
    setError(null); setBusy(true)
    try { await enqueueSync(cfg.platform); refreshJob() }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to start sync') }
    finally { setBusy(false) }
  }

  const disconnect = async () => {
    setError(null); setBusy(true)
    try { await cfg.disconnect(); refreshConns() }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to disconnect') }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{cfg.label}</span>
            {cfg.experimental && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Experimental
              </span>
            )}
          </div>
          {connected ? (
            <div className="text-sm text-muted-foreground">
              Connected as <span className="text-foreground">{connection!.reddit_username}</span> · last synced {relTime(connection!.last_synced_at)}
            </div>
          ) : connection?.status === 'revoked' ? (
            <div className="text-sm text-amber-600 dark:text-amber-400">Your credential expired — paste a fresh one to resume syncing.</div>
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
              type="button" onClick={disconnect} disabled={busy} aria-label={`Disconnect ${cfg.label}`}
              className="inline-flex items-center justify-center rounded-lg border p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2.5 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {!connected && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor={`${cfg.platform}-user`}>{cfg.userLabel}</label>
            <input
              id={`${cfg.platform}-user`} type="text" value={username} placeholder={cfg.userPlaceholder}
              onChange={(e) => setUsername(e.target.value)} autoComplete="off" spellCheck={false}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor={`${cfg.platform}-cred`}>{cfg.credLabel}</label>
            <textarea
              id={`${cfg.platform}-cred`} value={cred} rows={2} placeholder={cfg.credPlaceholder}
              onChange={(e) => setCred(e.target.value)} spellCheck={false}
              className="w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Help title={cfg.helpTitle} steps={cfg.helpSteps} />
          <button
            type="button" onClick={save} disabled={busy || !cred.trim() || !username.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-sm font-medium text-gold-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plug size={14} /> {busy ? 'Verifying…' : 'Connect & sync'}
          </button>
        </div>
      )}

      {showJob && (job?.status !== 'succeeded' || jobActive) && (
        <div className="mt-4"><SyncProgress job={showJob} /></div>
      )}
    </div>
  )
}

const REDDIT_CFG: CardConfig = {
  platform: 'reddit',
  label: 'Reddit',
  credLabel: 'Reddit cookie',
  credPlaceholder: 'Paste your reddit.com cookie header value…',
  userLabel: 'Reddit username',
  userPlaceholder: 'your_username',
  save: saveRedditCredential,
  disconnect: disconnectReddit,
  helpTitle: 'How do I get my Reddit cookie?',
  helpSteps: [
    <>Open <span className="text-foreground">reddit.com</span> in your browser, logged in.</>,
    <>Open DevTools (<span className="text-foreground">F12</span> → <span className="text-foreground">Network</span>).</>,
    <>Reload, click the first request to <span className="text-foreground">reddit.com</span>.</>,
    <>Under <span className="text-foreground">Request Headers</span>, copy the entire <span className="text-foreground">cookie:</span> value.</>,
    <>Paste it below. It’s encrypted at rest and only used to fetch your saves.</>,
  ],
}

const INSTAGRAM_CFG: CardConfig = {
  platform: 'instagram',
  label: 'Instagram',
  experimental: true,
  credLabel: 'Instagram sessionid',
  credPlaceholder: 'Paste your instagram.com sessionid cookie…',
  userLabel: 'Instagram username',
  userPlaceholder: 'your_handle',
  save: saveInstagramCredential,
  disconnect: disconnectInstagram,
  helpTitle: 'How do I get my Instagram sessionid?',
  helpSteps: [
    <>Open <span className="text-foreground">instagram.com</span> in your browser, logged in.</>,
    <>Open DevTools (<span className="text-foreground">F12</span>) → <span className="text-foreground">Application</span> → <span className="text-foreground">Cookies</span> → instagram.com.</>,
    <>Find the <span className="text-foreground">sessionid</span> row and copy its <span className="text-foreground">Value</span>.</>,
    <>Paste it below. Heads up: Instagram may expire it within a day or two — just re-paste when that happens.</>,
  ],
}

function AccessGate({ status }: { status: 'pending' | 'blocked' }) {
  const pending = status === 'pending'
  const Icon = pending ? Clock : Ban
  return (
    <div className="rounded-xl border bg-card p-6 text-center">
      <Icon size={28} className={`mx-auto mb-3 ${pending ? 'text-amber-500' : 'text-red-500'}`} aria-hidden />
      <div className="font-medium text-foreground">
        {pending ? 'Your account is pending approval' : 'Your account access is blocked'}
      </div>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        {pending
          ? 'Syncing is enabled once the owner approves your account. You can browse in the meantime — check back soon.'
          : 'Your access to sync features has been disabled. Reach out to the owner if you think this is a mistake.'}
      </p>
    </div>
  )
}

export default function ConnectionsPage() {
  const { data: connections, isLoading } = useConnections()
  const { data: accessStatus, isLoading: accessLoading } = useAccess()
  const byPlatform = (p: Platform) => connections?.find((c) => c.platform === p)

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl font-semibold text-foreground">Connections</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Link your accounts to sync and analyze your own saved posts. Your credentials are
        encrypted and used only to fetch your saves.
      </p>

      {isLoading || accessLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : accessStatus !== 'approved' ? (
        <AccessGate status={accessStatus === 'blocked' ? 'blocked' : 'pending'} />
      ) : (
        <div className="space-y-4">
          <PlatformCard cfg={REDDIT_CFG} connection={byPlatform('reddit')} />
          <PlatformCard cfg={INSTAGRAM_CFG} connection={byPlatform('instagram')} />
        </div>
      )}
    </div>
  )
}
