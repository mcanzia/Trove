import { useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, CircleDollarSign, Clock, Cpu, Hash, Zap } from 'lucide-react'
import { useAiUsage, useOpenRouterLive, useCloudflareLive, useGeminiLive, type ProviderStatus, type ProviderUsage, type GeminiModelUsage, type CloudflareLive, type GeminiLive } from '@/hooks/useAiUsage'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { UsersPanel } from '@/components/admin/UsersPanel'
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

/** Compact token count: 1234 → "1.2k", 2_500_000 → "2.5M". */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

/** One-line "model · 1.2k tok" summary, for the compact (mobile) view. */
function modelsSummary(models: ProviderUsage['models']): string {
  return models.map((m) => (m.tokens > 0 ? `${m.model} · ${fmtTokens(m.tokens)} tok` : m.model)).join(', ')
}

/**
 * Best-available "daily quota" signal for a provider, normalised to used/limit so
 * it can render as a usage bar (how much of today's free allotment is gone).
 * Sources, in priority order:
 *   - Cloudflare → authoritative neurons/day feed
 *   - Gemini → authoritative per-model requests/day (Cloud Monitoring); shows the
 *     most-consumed model (full breakdown is in the Gemini panel below)
 *   - everyone else → the provider's own rate-limit headers (requests, else tokens)
 * Returns null when the provider doesn't report a daily quota.
 */
function dailyQuota(
  p: ProviderUsage,
  cf?: CloudflareLive,
  gemini?: GeminiLive,
): { used: number; limit: number; unit: string; title: string } | null {
  if (p.provider === 'cloudflare' && cf?.available && cf.dailyFreeNeurons != null && cf.neuronsToday != null) {
    const left = cf.neuronsRemaining ?? Math.max(cf.dailyFreeNeurons - cf.neuronsToday, 0)
    return { used: cf.neuronsToday, limit: cf.dailyFreeNeurons, unit: 'neurons',
      title: `${left.toLocaleString()} of ${cf.dailyFreeNeurons.toLocaleString()} free neurons left today` }
  }
  if (p.provider === 'gemini' && gemini?.available && gemini.models?.length) {
    const withLimit = gemini.models.filter((m) => m.rpd.limit != null)
    const worst = withLimit.sort((a, b) => (b.rpd.used / (b.rpd.limit ?? 1)) - (a.rpd.used / (a.rpd.limit ?? 1)))[0]
    if (worst && worst.rpd.limit != null) {
      return { used: worst.rpd.used, limit: worst.rpd.limit, unit: 'req/day',
        title: `${worst.model}: ${(worst.rpd.limit - worst.rpd.used).toLocaleString()} of ${worst.rpd.limit.toLocaleString()} requests left today (see Gemini panel for all models)` }
    }
  }
  const r = p.rateLimit?.requests
  if (r && r.remaining != null && r.limit != null) {
    return { used: Math.max(r.limit - r.remaining, 0), limit: r.limit, unit: 'requests',
      title: `${r.remaining.toLocaleString()} of ${r.limit.toLocaleString()} requests left${r.reset ? ` · resets ${r.reset}` : ''}` }
  }
  const t = p.rateLimit?.tokens
  if (t && t.remaining != null && t.limit != null) {
    return { used: Math.max(t.limit - t.remaining, 0), limit: t.limit, unit: 'tokens',
      title: `${t.remaining.toLocaleString()} of ${t.limit.toLocaleString()} tokens left${t.reset ? ` · resets ${t.reset}` : ''}` }
  }
  return null
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
      {/* Desktop/tablet: table */}
      <div className="hidden rounded-xl border bg-card sm:block">
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
      {/* Mobile: card per model */}
      <div className="space-y-3 sm:hidden">
        {models.map((m) => (
          <div key={m.model} className="rounded-xl border bg-card p-3.5 shadow-xs">
            <div className="mb-2 text-sm font-medium">{m.model}</div>
            <div className="space-y-1.5">
              {([['RPD (today)', m.rpd.used, m.rpd.limit], ['RPM (peak)', m.rpm.peak, m.rpm.limit], ['TPM (peak)', m.tpm.peak, m.tpm.limit]] as const).map(([label, used, limit]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <UsageBar used={used} limit={limit} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AdminPage
// ---------------------------------------------------------------------------
export default function AdminPage() {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(1)
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
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <SummaryCard
          icon={Activity}
          label="Total AI calls"
          value={data ? data.totalCalls.toLocaleString() : '—'}
          sub={`over ${days} day${days > 1 ? 's' : ''}`}
          isLoading={isLoading}
        />
        <SummaryCard
          icon={Hash}
          label="Tokens (window)"
          value={data?.totalTokens ? data.totalTokens.toLocaleString() : '—'}
          sub="prompt + completion"
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
        <div className="hidden rounded-xl border bg-card sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Success</TableHead>
                <TableHead className="text-right">Daily quota (used)</TableHead>
                <TableHead className="text-right">Tokens ({days}d)</TableHead>
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
                      <span className="block max-w-[260px] text-[11px] text-muted-foreground">
                        {p.models.map((m) => (
                          <span key={m.model} className="block truncate">
                            {m.model}
                            {m.tokens > 0 && <> · {fmtTokens(m.tokens)} tok</>}
                            {m.calls > 0 && <> · {m.calls.toLocaleString()} call{m.calls === 1 ? '' : 's'}</>}
                          </span>
                        ))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell><StatusChip status={p.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{unused ? '—' : p.calls.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {unused ? <span className="text-muted-foreground">—</span> : (
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1">
                          {p.successRate >= 0.95 && <CheckCircle2 size={13} className="text-emerald-500" aria-hidden />}
                          {(p.successRate * 100).toFixed(0)}%
                        </span>
                        {/* Outcome mix (ok/quota/budget/error) — only meaningful when some failed */}
                        {p.ok < p.calls && <MixBar p={p} />}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(() => {
                      const q = dailyQuota(p, cf, gemini)
                      return q ? (
                        <span className="inline-flex items-center justify-end gap-1.5" title={q.title}>
                          <UsageBar used={q.used} limit={q.limit} />
                          <span className="text-[10px] text-muted-foreground">{q.unit}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground" title="this provider doesn't report a daily quota">—</span>
                      )
                    })()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.tokens > 0 ? p.tokens.toLocaleString() : '—'}</TableCell>
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

      {/* Mobile: card per provider */}
      {!error && !isLoading && data && data.providers.length > 0 && (
        <div className="space-y-3 sm:hidden">
          {data.providers.map((p) => {
            const unused = p.calls === 0
            return (
              <div key={p.provider} className={`rounded-xl border bg-card p-3.5 shadow-xs ${unused ? 'opacity-55' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{p.provider}</div>
                    {p.models.length > 0 && (
                      <div className="truncate text-[11px] text-muted-foreground">{modelsSummary(p.models)}</div>
                    )}
                  </div>
                  <StatusChip status={p.status} />
                </div>
                {unused ? (
                  <div className="mt-2 text-xs text-muted-foreground">Tasks {p.tasks.join(', ') || '—'}</div>
                ) : (
                  <>
                    <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Calls <span className="tabular-nums text-foreground">{p.calls.toLocaleString()}</span></span>
                      <span className="inline-flex items-center gap-1">Success{' '}
                        <span className="inline-flex items-center gap-1 tabular-nums text-foreground">
                          {p.successRate >= 0.95 && <CheckCircle2 size={13} className="text-emerald-500" aria-hidden />}
                          {(p.successRate * 100).toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    {p.ok < p.calls && <div className="mt-2"><MixBar p={p} /></div>}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {(() => {
                        const q = dailyQuota(p, cf, gemini)
                        return q ? (
                          <span title={q.title}>Quota left{' '}
                            <span className="tabular-nums text-foreground">
                              {Math.max(q.limit - q.used, 0).toLocaleString()}/{q.limit.toLocaleString()}
                            </span> {q.unit}
                          </span>
                        ) : null
                      })()}
                      {p.tokens > 0 && <span>Tokens <span className="tabular-nums text-foreground">{p.tokens.toLocaleString()}</span></span>}
                      <span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden />{relTime(p.lastSeen)}</span>
                      {p.tasks.length > 0 && <span>Tasks <span className="text-foreground">{p.tasks.join(', ')}</span></span>}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Mix legend — only when a mix bar is actually shown (some calls failed) */}
      {data && data.providers.some((p) => p.calls > 0 && p.ok < p.calls) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>Outcome mix (under Success):</span>
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

      {/* Quota explainer */}
      {data && data.providers.some((p) => p.calls > 0) && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Daily quota left</span> = today's free-tier allotment consumed vs the limit
          (bar fills as you use it; hover for exactly how much is left and when it resets). Cloudflare uses its neurons/day feed,
          Gemini its authoritative requests/day (full per-model breakdown below), others their rate-limit headers; “—” means the
          provider doesn't report a daily quota. <span className="font-medium text-foreground">Tokens ({days}d)</span> is total
          prompt + completion tokens over the selected window.
        </p>
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

      {/* Users & access — approve new accounts before they can sync */}
      <UsersPanel />
    </div>
  )
}
