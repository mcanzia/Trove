import { useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, CircleDollarSign, Clock, Cpu, Zap } from 'lucide-react'
import { useAiUsage, useOpenRouterLive, useCloudflareLive, useGeminiLive, type ProviderStatus, type ProviderUsage, type GeminiModelUsage } from '@/hooks/useAiUsage'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

const WINDOWS = [1, 7, 30] as const

function fmtUsd(n: number | undefined): string {
  if (n == null) return '—'
  return n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

const STATUS_STYLES: Record<ProviderStatus, { dot: string; label: string; text: string }> = {
  healthy: { dot: 'bg-emerald-500', label: 'Healthy', text: 'text-emerald-600 dark:text-emerald-400' },
  throttled: { dot: 'bg-amber-500', label: 'Throttled', text: 'text-amber-600 dark:text-amber-400' },
  exhausted: { dot: 'bg-red-500', label: 'Exhausted', text: 'text-red-600 dark:text-red-400' },
  idle: { dot: 'bg-muted-foreground/40', label: 'Idle', text: 'text-muted-foreground' },
}

function StatusChip({ status }: { status: ProviderStatus }) {
  const s = STATUS_STYLES[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------
interface SummaryCardProps {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  isLoading?: boolean
  tone?: 'default' | 'warn' | 'danger'
}

function SummaryCard({ icon: Icon, label, value, sub, isLoading, tone = 'default' }: SummaryCardProps) {
  const toneText = tone === 'danger' ? 'text-red-600 dark:text-red-400'
    : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
    : 'text-foreground'
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={15} aria-hidden />
        <span className="text-xs">{label}</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-7 w-24" />
      ) : (
        <span className={`font-display text-2xl tabular-nums font-semibold ${toneText}`}>{value}</span>
      )}
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

/** Compact "remaining/limit" headroom from captured rate-limit headers. */
function headroom(p: ProviderUsage): { label: string; title: string } {
  const r = p.rateLimit?.requests
  const t = p.rateLimit?.tokens
  if ((!r || r.remaining == null) && (!t || t.remaining == null)) return { label: '—', title: 'no rate-limit headers' }
  const label = r && r.remaining != null ? `${r.remaining.toLocaleString()}${r.limit != null ? `/${r.limit.toLocaleString()}` : ''}` : '—'
  const parts: string[] = []
  if (r?.remaining != null) parts.push(`requests: ${r.remaining}${r.limit != null ? `/${r.limit}` : ''}${r.reset ? ` (resets ${r.reset})` : ''}`)
  if (t?.remaining != null) parts.push(`tokens: ${t.remaining}${t.limit != null ? `/${t.limit}` : ''}${t.reset ? ` (resets ${t.reset})` : ''}`)
  return { label, title: parts.join(' · ') }
}

// ---------------------------------------------------------------------------
// Failure bar — ok / quota / budget / error proportions
// ---------------------------------------------------------------------------
function MixBar({ p }: { p: ProviderUsage }) {
  const segs = [
    { n: p.ok, cls: 'bg-emerald-500', title: 'ok' },
    { n: p.quota, cls: 'bg-amber-500', title: 'quota' },
    { n: p.budget, cls: 'bg-orange-500', title: 'budget' },
    { n: p.error, cls: 'bg-red-500', title: 'error' },
  ].filter((s) => s.n > 0)
  return (
    <div className="flex h-1.5 w-24 overflow-hidden rounded-full bg-muted" title={`ok ${p.ok} · quota ${p.quota} · budget ${p.budget} · error ${p.error}`}>
      {segs.map((s, i) => (
        <div key={i} className={s.cls} style={{ width: `${(s.n / p.calls) * 100}%` }} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gemini per-model usage (authoritative, from Cloud Monitoring)
// ---------------------------------------------------------------------------
function UsageBar({ used, limit }: { used: number; limit: number | null }) {
  const pct = limit && limit > 0 ? Math.min((used / limit) * 100, 100) : 0
  const over = limit != null && used >= limit
  const warn = limit != null && pct >= 75
  const color = over ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={color} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-xs">{used.toLocaleString()}<span className="text-muted-foreground">/{limit != null ? limit.toLocaleString() : '∞'}</span></span>
    </div>
  )
}

function GeminiPanel({ models }: { models: GeminiModelUsage[] }) {
  return (
    <div className="mt-6">
      <h2 className="mb-1 font-display text-lg font-semibold text-foreground">Gemini — per-model (live)</h2>
      <p className="mb-3 text-xs text-muted-foreground">Authoritative quota usage from Google Cloud Monitoring · RPD resets midnight Pacific</p>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">RPD (today)</TableHead>
              <TableHead className="text-right">RPM (peak)</TableHead>
              <TableHead className="text-right">TPM (peak)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((m) => (
              <TableRow key={m.model}>
                <TableCell className="font-medium">{m.model}</TableCell>
                <TableCell><UsageBar used={m.rpd.used} limit={m.rpd.limit} /></TableCell>
                <TableCell><UsageBar used={m.rpm.peak} limit={m.rpm.limit} /></TableCell>
                <TableCell><UsageBar used={m.tpm.peak} limit={m.tpm.limit} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AdminPage
// ---------------------------------------------------------------------------
export default function AdminPage() {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(7)
  const { data, isLoading, error } = useAiUsage(days)
  const { data: live } = useOpenRouterLive()
  const { data: cf } = useCloudflareLive()
  const { data: gemini } = useGeminiLive()

  const overBudget = live?.available && live.budgetRemainingUsd != null && live.budgetRemainingUsd <= 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">AI Model Usage</h1>
          <p className="text-sm text-muted-foreground">
            Provider load &amp; exhaustion across text, video, and image tasks
            {data?.lastEventAt && <> · last call {relTime(data.lastEventAt)}</>}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                days === w ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard
          icon={Activity}
          label="Total AI calls"
          value={data ? data.totalCalls.toLocaleString() : '—'}
          sub={`over ${days} day${days > 1 ? 's' : ''}`}
          isLoading={isLoading}
        />
        <SummaryCard
          icon={CircleDollarSign}
          label="Paid spend (window)"
          value={fmtUsd(data?.totalCostUsd)}
          sub="OpenRouter paid calls"
          isLoading={isLoading}
        />
        <SummaryCard
          icon={Zap}
          label="OpenRouter today"
          value={live?.available ? fmtUsd(live.spentTodayUsd) : '—'}
          sub={live?.available ? `of ${fmtUsd(live.dailyBudgetUsd)} budget` : 'no live key'}
          tone={overBudget ? 'danger' : live?.available && (live.budgetRemainingUsd ?? 1) < (live.dailyBudgetUsd ?? 2) * 0.25 ? 'warn' : 'default'}
        />
        <SummaryCard
          icon={CircleDollarSign}
          label="OpenRouter balance"
          value={live?.available ? fmtUsd(live.balanceUsd) : '—'}
          sub={live?.available ? (live.isFreeTier ? 'free tier' : 'prepaid credits') : 'no live key'}
        />
        <SummaryCard
          icon={Cpu}
          label="Cloudflare neurons"
          value={cf?.available && cf.neuronsToday != null ? cf.neuronsToday.toLocaleString() : '—'}
          sub={cf?.available && cf.dailyFreeNeurons != null ? `of ${cf.dailyFreeNeurons.toLocaleString()}/day free` : cf?.error ? 'analytics scope needed' : 'no live key'}
          tone={cf?.available && cf.neuronsRemaining != null && cf.neuronsRemaining <= 0 ? 'danger'
            : cf?.available && cf.neuronsRemaining != null && cf.dailyFreeNeurons != null && cf.neuronsRemaining < cf.dailyFreeNeurons * 0.25 ? 'warn' : 'default'}
        />
      </div>

      {/* Provider table */}
      {error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load usage"
          description={error instanceof Error ? error.message : 'Unknown error'}
        />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !data ? (
        <EmptyState
          icon={Activity}
          title="No AI usage recorded yet"
          description="Once the pipeline runs with telemetry enabled, provider calls will appear here. Make sure the ai_usage_events table exists and the pipeline has SUPABASE_URL/SUPABASE_KEY set."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Success</TableHead>
                <TableHead>Mix</TableHead>
                <TableHead className="text-right">Headroom</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Last seen</TableHead>
                <TableHead>Tasks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.providers.map((p) => {
                const unused = p.calls === 0
                return (
                <TableRow key={p.provider} className={unused ? 'opacity-55' : undefined}>
                  <TableCell className="font-medium">
                    {p.provider}
                    {p.models.length > 0 && (
                      <span className="block max-w-[220px] truncate text-[11px] text-muted-foreground">
                        {p.models.join(', ')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell><StatusChip status={p.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{unused ? '—' : p.calls.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {unused ? <span className="text-muted-foreground">—</span> : (
                      <span className="inline-flex items-center gap-1">
                        {p.successRate >= 0.95 && <CheckCircle2 size={13} className="text-emerald-500" aria-hidden />}
                        {(p.successRate * 100).toFixed(0)}%
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{unused ? <span className="text-muted-foreground">—</span> : <MixBar p={p} />}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground" title={headroom(p).title}>
                    {headroom(p).label}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.costUsd > 0 ? fmtUsd(p.costUsd) : '—'}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    <span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden />{relTime(p.lastSeen)}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.tasks.join(', ')}</TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Mix legend */}
      {data && data.providers.some((p) => p.calls > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>Mix:</span>
          {([
            ['bg-emerald-500', 'ok — succeeded'],
            ['bg-amber-500', 'quota — rate/quota limit'],
            ['bg-orange-500', 'budget — paid cap reached'],
            ['bg-red-500', 'error — failed'],
          ] as const).map(([cls, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${cls}`} aria-hidden />
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Per-task footer */}
      {data && (
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          {(['text', 'video', 'image'] as const).map((t) => {
            const b = data.byTask[t]
            if (!b || b.calls === 0) return null
            return (
              <span key={t}>
                <span className="font-medium capitalize text-foreground">{t}</span>{' '}
                {b.calls.toLocaleString()} calls · {((b.ok / b.calls) * 100).toFixed(0)}% ok
                {b.costUsd > 0 && <> · {fmtUsd(b.costUsd)}</>}
              </span>
            )
          })}
        </div>
      )}

      {/* Authoritative per-model Gemini usage (Cloud Monitoring) */}
      {gemini?.available && gemini.models && gemini.models.length > 0 && (
        <GeminiPanel models={gemini.models} />
      )}
      {gemini?.available && gemini.error && (
        <p className="mt-4 text-xs text-amber-600 dark:text-amber-400">Gemini live usage unavailable: {gemini.error}</p>
      )}
    </div>
  )
}
