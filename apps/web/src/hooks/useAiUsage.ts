import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type ProviderStatus = 'healthy' | 'throttled' | 'exhausted'

export interface RateLimitLeg {
  limit: number | null
  remaining: number | null
  reset: string | null
}
export interface RateLimit {
  requests?: RateLimitLeg
  tokens?: RateLimitLeg
}

export interface ProviderUsage {
  provider: string
  calls: number
  ok: number
  quota: number
  budget: number
  error: number
  successRate: number
  costUsd: number
  lastSeen: string
  latestStatus: string
  models: string[]
  tasks: string[]
  rateLimit: RateLimit | null
  status: ProviderStatus
}

export interface TaskCounts {
  calls: number
  ok: number
  quota: number
  budget: number
  error: number
  costUsd: number
}

export interface DayCounts extends TaskCounts {
  date: string
}

export interface AiUsage {
  windowDays: number
  generatedAt: string
  totalCalls: number
  totalCostUsd: number
  lastEventAt: string | null
  lastRunId: string | null
  providers: ProviderUsage[]
  byTask: Record<string, TaskCounts>
  byDay: DayCounts[]
}

/** Aggregated AI-call telemetry over a recent window, served by @trove/api. */
export function useAiUsage(days = 7) {
  return useQuery<AiUsage>({
    queryKey: ['ai-usage', days],
    queryFn: async () => {
      const res = await api.api['ai-usage'].$get({ query: { days } })
      if (!res.ok) throw new Error(`Failed to load AI usage (${res.status})`)
      return (await res.json()) as AiUsage
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

export interface OpenRouterLive {
  available: boolean
  error?: string
  balanceUsd?: number
  totalCreditsUsd?: number
  totalUsageUsd?: number
  spentTodayUsd?: number
  dailyBudgetUsd?: number
  budgetRemainingUsd?: number
  isFreeTier?: boolean
}

/** Live OpenRouter balance/budget (proxied server-side so the key stays hidden). */
export function useOpenRouterLive() {
  return useQuery<OpenRouterLive>({
    queryKey: ['ai-usage', 'openrouter'],
    queryFn: async () => {
      const res = await api.api['ai-usage'].openrouter.$get()
      return (await res.json()) as OpenRouterLive
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

export interface CloudflareLive {
  available: boolean
  error?: string
  dailyFreeNeurons?: number
  neuronsToday?: number
  neuronsRemaining?: number
  byDay?: { date: string; neurons: number; requests: number }[]
}

/** Live Cloudflare Workers AI neuron usage vs the 10k/day free allotment. */
export function useCloudflareLive() {
  return useQuery<CloudflareLive>({
    queryKey: ['ai-usage', 'cloudflare'],
    queryFn: async () => {
      const res = await api.api['ai-usage'].cloudflare.$get()
      return (await res.json()) as CloudflareLive
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })
}

export interface GeminiModelUsage {
  model: string
  rpd: { used: number; limit: number | null }
  rpm: { peak: number; limit: number | null }
  tpm: { peak: number; limit: number | null }
}
export interface GeminiLive {
  available: boolean
  error?: string
  generatedAt?: string
  models?: GeminiModelUsage[]
}

/** Authoritative per-model Gemini usage from Cloud Monitoring (quota day). */
export function useGeminiLive() {
  return useQuery<GeminiLive>({
    queryKey: ['ai-usage', 'gemini'],
    queryFn: async () => {
      const res = await api.api['ai-usage'].gemini.$get()
      return (await res.json()) as GeminiLive
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}
