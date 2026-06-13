import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../lib/context.js'
import { env } from '../lib/env.js'

/**
 * Admin dashboard data for AI model usage/exhaustion.
 *
 * GET /            — aggregates of ai_usage_events over a recent window (per
 *                    provider, per task, per day). The pipeline writes one row
 *                    per AI call (see SavedPosts llm_utils.record_ai_event).
 * GET /openrouter  — LIVE balance/budget from the OpenRouter API. The key lives
 *                    server-side (env.OPENROUTER_API_KEY) and never reaches the
 *                    client. Returns { available:false } when no key is set.
 */

type UsageRow = {
  ts: string
  run_id: string | null
  provider: string
  model: string | null
  task: string
  status: string
  cost_usd: number | string | null
}

type Counts = { calls: number; ok: number; quota: number; budget: number; error: number; costUsd: number }

const emptyCounts = (): Counts => ({ calls: 0, ok: 0, quota: 0, budget: 0, error: 0, costUsd: 0 })

function tally(c: Counts, status: string, cost: number) {
  c.calls += 1
  c.costUsd += cost
  if (status === 'ok') c.ok += 1
  else if (status === 'quota') c.quota += 1
  else if (status === 'budget') c.budget += 1
  else c.error += 1
}

/** Derive a coarse health signal from a provider's counts + its latest status. */
function deriveStatus(c: Counts, latestStatus: string): 'healthy' | 'throttled' | 'exhausted' {
  if (latestStatus === 'quota' || latestStatus === 'budget') return 'exhausted'
  const failRate = c.calls ? (c.quota + c.budget + c.error) / c.calls : 0
  if (failRate >= 0.25) return 'throttled'
  return 'healthy'
}

export const aiUsage = new Hono<AppEnv>()
  .get('/', zValidator('query', z.object({ days: z.coerce.number().int().min(1).max(90).default(7) })), async (c) => {
    const { days } = c.req.valid('query')
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const supabase = c.get('supabase')

    // Page through the window (PostgREST caps at 1000 rows/response).
    const PAGE = 1000
    const MAX_ROWS = 50_000 // safety cap so a huge window can't hang the request
    const rows: UsageRow[] = []
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await supabase
        .from('ai_usage_events')
        .select('ts, run_id, provider, model, task, status, cost_usd')
        .gte('ts', since)
        .order('ts', { ascending: false })
        .range(from, from + PAGE - 1)
      if (error) return c.json({ error: error.message }, 500)
      const page = (data ?? []) as UsageRow[]
      rows.push(...page)
      if (page.length < PAGE) break
    }

    const providers = new Map<string, Counts & { lastSeen: string; latestStatus: string; models: Set<string>; tasks: Set<string> }>()
    const byTask: Record<string, Counts> = { text: emptyCounts(), video: emptyCounts(), image: emptyCounts() }
    const byDay = new Map<string, Counts>()
    let totalCostUsd = 0

    for (const r of rows) {
      const cost = Number(r.cost_usd ?? 0) || 0
      totalCostUsd += cost

      // rows are ts-desc, so the FIRST time we see a provider is its latest event
      let p = providers.get(r.provider)
      if (!p) {
        p = { ...emptyCounts(), lastSeen: r.ts, latestStatus: r.status, models: new Set(), tasks: new Set() }
        providers.set(r.provider, p)
      }
      tally(p, r.status, cost)
      if (r.model) p.models.add(r.model)
      p.tasks.add(r.task)

      const taskBucket = byTask[r.task] ?? (byTask[r.task] = emptyCounts())
      tally(taskBucket, r.status, cost)

      const day = r.ts.slice(0, 10)
      const d = byDay.get(day) ?? byDay.set(day, emptyCounts()).get(day)!
      tally(d, r.status, cost)
    }

    const providerList = [...providers.entries()]
      .map(([provider, p]) => ({
        provider,
        calls: p.calls,
        ok: p.ok,
        quota: p.quota,
        budget: p.budget,
        error: p.error,
        successRate: p.calls ? p.ok / p.calls : 0,
        costUsd: Number(p.costUsd.toFixed(6)),
        lastSeen: p.lastSeen,
        latestStatus: p.latestStatus,
        models: [...p.models],
        tasks: [...p.tasks],
        status: deriveStatus(p, p.latestStatus),
      }))
      .sort((a, b) => b.calls - a.calls)

    const byDayList = [...byDay.entries()]
      .map(([date, d]) => ({ date, calls: d.calls, ok: d.ok, quota: d.quota, budget: d.budget, error: d.error, costUsd: Number(d.costUsd.toFixed(6)) }))
      .sort((a, b) => a.date.localeCompare(b.date))

    c.header('Cache-Control', 'max-age=60')
    return c.json({
      windowDays: days,
      generatedAt: new Date().toISOString(),
      totalCalls: rows.length,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      lastEventAt: rows[0]?.ts ?? null,
      lastRunId: rows[0]?.run_id ?? null,
      providers: providerList,
      byTask,
      byDay: byDayList,
    })
  })
  .get('/openrouter', async (c) => {
    const key = env.OPENROUTER_API_KEY
    if (!key) return c.json({ available: false as const })

    try {
      const headers = { Authorization: `Bearer ${key}` }
      const [keyRes, creditsRes] = await Promise.all([
        fetch('https://openrouter.ai/api/v1/key', { headers }),
        fetch('https://openrouter.ai/api/v1/credits', { headers }),
      ])
      if (!keyRes.ok || !creditsRes.ok) {
        return c.json({ available: true as const, error: `OpenRouter API ${keyRes.status}/${creditsRes.status}` }, 502)
      }
      const keyData = ((await keyRes.json()) as { data?: Record<string, unknown> }).data ?? {}
      const credits = ((await creditsRes.json()) as { data?: Record<string, unknown> }).data ?? {}
      const totalCredits = Number(credits.total_credits ?? 0)
      const totalUsage = Number(credits.total_usage ?? 0)
      const spentToday = Number(keyData.usage_daily ?? 0)
      const budget = env.OPENROUTER_DAILY_BUDGET_USD

      c.header('Cache-Control', 'max-age=60')
      return c.json({
        available: true as const,
        balanceUsd: Number((totalCredits - totalUsage).toFixed(6)),
        totalCreditsUsd: totalCredits,
        totalUsageUsd: Number(totalUsage.toFixed(6)),
        spentTodayUsd: Number(spentToday.toFixed(6)),
        dailyBudgetUsd: budget,
        budgetRemainingUsd: Number(Math.max(budget - spentToday, 0).toFixed(6)),
        isFreeTier: Boolean(keyData.is_free_tier),
      })
    } catch (e) {
      return c.json({ available: true as const, error: e instanceof Error ? e.message : 'fetch failed' }, 502)
    }
  })
