import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AnalysisItem, Platform } from '@/types'

interface UseAnalysisItemsOptions {
  categoryName: string
  platform?: Platform
}

/** Analysis items for a category (newest first), served by @trove/api. */
export function useAnalysisItems({ categoryName, platform }: UseAnalysisItemsOptions) {
  return useQuery<AnalysisItem[]>({
    queryKey: ['analysis_items', categoryName, platform],
    enabled: !!categoryName,
    queryFn: async () => {
      const res = await api.api['analysis-items'].$get({
        query: platform ? { category: categoryName, platform } : { category: categoryName },
      })
      if (!res.ok) throw new Error(`Failed to load analysis items (${res.status})`)
      return res.json()
    },
  })
}
