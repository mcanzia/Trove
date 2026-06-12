import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Stats {
  total: number
  perCategory: Record<string, number>
}

/** Per-category item counts + overall total, served by @trove/api. */
export function useStats() {
  return useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await api.api.stats.$get()
      if (!res.ok) throw new Error(`Failed to load stats (${res.status})`)
      return res.json()
    },
    staleTime: 5 * 60_000,
  })
}
