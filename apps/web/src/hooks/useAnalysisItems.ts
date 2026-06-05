import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AnalysisItem, Platform } from '@/types'

interface UseAnalysisItemsOptions {
  categoryName: string
  platform?: Platform
}

export function useAnalysisItems({ categoryName, platform }: UseAnalysisItemsOptions) {
  return useQuery<AnalysisItem[]>({
    queryKey: ['analysis_items', categoryName, platform],
    queryFn: async () => {
      let query = supabase
        .from('analysis_items')
        .select('*, posts(url, year, timestamp, caption, owner, owner_fullname, platform)')
        .eq('category_name', categoryName)
        .order('created_at', { ascending: false })

      if (platform) {
        query = query.eq('platform', platform)
      }

      const { data, error } = await query
      if (error) throw error
      return (data as AnalysisItem[]).map((item) => ({
        ...item,
        item_data: typeof item.item_data === 'string'
          ? JSON.parse(item.item_data)
          : item.item_data,
      }))
    },
    enabled: !!categoryName,
  })
}
