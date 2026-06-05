import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Category } from '@/types'

/** All categories (ordered by name), served by @trove/api. */
export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.api.categories.$get()
      if (!res.ok) throw new Error(`Failed to load categories (${res.status})`)
      return res.json()
    },
  })
}
