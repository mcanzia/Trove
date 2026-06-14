import { GoogleAuth } from 'google-auth-library'
import { env } from './env.js'

/**
 * Authoritative per-model Gemini usage via the Cloud Monitoring API — the same
 * data behind the AI Studio "Rate Limit" dashboard, read from the project's
 * free-tier quota metrics:
 *   generativelanguage.googleapis.com/quota/generate_content_free_tier_requests/{usage,limit}
 *   generativelanguage.googleapis.com/quota/generate_content_free_tier_input_token_count/{usage,limit}
 * Each carries a `model` label and a `limit_name` (…PerDay… / …PerMinute…).
 * The usage metrics are DELTA counters; we sum over the current quota day (resets
 * midnight Pacific) for RPD/TPD and take the peak 60s bucket for RPM/TPM.
 */

const MON = 'https://monitoring.googleapis.com/v3'
const SCOPE = 'https://www.googleapis.com/auth/monitoring.read'
const Q = 'generativelanguage.googleapis.com/quota'
const INT64_MAX = '9223372036854775807' // Cloud Monitoring's "no limit" sentinel

export interface GeminiModelUsage {
  model: string
  rpd: { used: number; limit: number | null }
  rpm: { peak: number; limit: number | null }
  tpm: { peak: number; limit: number | null }
}

export function geminiMonitoringAvailable(): boolean {
  return Boolean(env.GEMINI_MONITORING_PROJECT_ID && (env.GEMINI_MONITORING_SA_JSON || env.GEMINI_MONITORING_SA_KEYFILE))
}

let _auth: GoogleAuth | null = null
function auth(): GoogleAuth {
  if (_auth) return _auth
  _auth = env.GEMINI_MONITORING_SA_JSON
    ? new GoogleAuth({ credentials: JSON.parse(env.GEMINI_MONITORING_SA_JSON) as object, scopes: [SCOPE] })
    : new GoogleAuth({ keyFile: env.GEMINI_MONITORING_SA_KEYFILE, scopes: [SCOPE] })
  return _auth
}

type Series = { metric: { labels: Record<string, string> }; points: { value: { int64Value?: string; doubleValue?: number } }[] }
const ptVal = (p: Series['points'][number]) => Number(p.value.int64Value ?? p.value.doubleValue ?? 0)

/** Midnight Pacific (Gemini's quota-day reset), as a UTC Date. */
function pacificMidnightUtc(now: Date): Date {
  const ptNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const ptMidnight = new Date(ptNow)
  ptMidnight.setHours(0, 0, 0, 0)
  const offset = now.getTime() - ptNow.getTime() // UTC − PT, in ms
  return new Date(ptMidnight.getTime() + offset)
}

async function fetchSeries(token: string, project: string, params: Record<string, string>): Promise<Series[]> {
  const url = `${MON}/projects/${project}/timeSeries?` + new URLSearchParams(params).toString()
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  // A service account has no billing-enabled quota project, so reads against a
  // free-tier (billing-off) project 403 with "requires billing". Attribute the
  // (free) read to a billing-enabled project the SA can use instead.
  if (env.GEMINI_MONITORING_QUOTA_PROJECT) headers['x-goog-user-project'] = env.GEMINI_MONITORING_QUOTA_PROJECT
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`monitoring ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return ((await res.json()) as { timeSeries?: Series[] }).timeSeries ?? []
}

export async function fetchGeminiUsage(): Promise<GeminiModelUsage[]> {
  const project = env.GEMINI_MONITORING_PROJECT_ID!
  const token = await auth().getAccessToken()
  if (!token) throw new Error('failed to mint Cloud Monitoring access token')

  const now = new Date()
  const dayStart = pacificMidnightUtc(now).toISOString()
  const nowIso = now.toISOString()
  const limitStart = new Date(now.getTime() - 50 * 3600_000).toISOString() // limits are sparse gauges

  const usageParams = (metric: string) => ({
    filter: `metric.type="${Q}/${metric}/usage"`,
    'interval.startTime': dayStart,
    'interval.endTime': nowIso,
    'aggregation.alignmentPeriod': '60s',
    'aggregation.perSeriesAligner': 'ALIGN_SUM',
  })
  const limitParams = (metric: string) => ({
    filter: `metric.type="${Q}/${metric}/limit"`,
    'interval.startTime': limitStart,
    'interval.endTime': nowIso,
  })

  const [reqUsage, reqLimit, tokUsage, tokLimit] = await Promise.all([
    fetchSeries(token, project, usageParams('generate_content_free_tier_requests')),
    fetchSeries(token, project, limitParams('generate_content_free_tier_requests')),
    fetchSeries(token, project, usageParams('generate_content_free_tier_input_token_count')),
    fetchSeries(token, project, limitParams('generate_content_free_tier_input_token_count')),
  ])

  const byModel = new Map<string, GeminiModelUsage>()
  const get = (m: string) =>
    byModel.get(m) ?? byModel.set(m, { model: m, rpd: { used: 0, limit: null }, rpm: { peak: 0, limit: null }, tpm: { peak: 0, limit: null } }).get(m)!

  // Usage rows are duplicated per limit_name (PerDay/PerMinute) with identical
  // values — use the PerDay series so each model is counted once.
  for (const s of reqUsage) {
    if (!s.metric.labels.limit_name?.includes('PerDay')) continue
    const u = get(s.metric.labels.model ?? '?')
    const pts = s.points.map(ptVal)
    u.rpd.used += pts.reduce((a, b) => a + b, 0)
    u.rpm.peak = Math.max(u.rpm.peak, ...(pts.length ? pts : [0]))
  }
  for (const s of tokUsage) {
    if (!s.metric.labels.limit_name?.includes('PerMinute')) continue
    const u = get(s.metric.labels.model ?? '?')
    u.tpm.peak = Math.max(u.tpm.peak, ...(s.points.map(ptVal).length ? s.points.map(ptVal) : [0]))
  }

  const latestLimit = (s: Series): number | null => {
    const raw = s.points.find((p) => p.value.int64Value || p.value.doubleValue)
    if (!raw) return null
    if (raw.value.int64Value === INT64_MAX) return null // "no limit"
    return ptVal(raw)
  }
  for (const s of reqLimit) {
    const u = get(s.metric.labels.model ?? '?')
    if (s.metric.labels.limit_name?.includes('PerDay')) u.rpd.limit = latestLimit(s)
    else if (s.metric.labels.limit_name?.includes('PerMinute')) u.rpm.limit = latestLimit(s)
  }
  for (const s of tokLimit) {
    if (!s.metric.labels.limit_name?.includes('PerMinute')) continue
    get(s.metric.labels.model ?? '?').tpm.limit = latestLimit(s)
  }

  return [...byModel.values()].sort((a, b) => b.rpd.used - a.rpd.used)
}
