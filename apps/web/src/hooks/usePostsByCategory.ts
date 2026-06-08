import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CategoryPost, Platform } from '@trove/shared'

/** Every post classified into a category (served by @trove/api), regardless of
 *  whether it produced an extracted item. Powers the "surface every post" cards. */
export function usePostsByCategory({ categoryName, platform }: { categoryName: string; platform?: Platform }) {
  return useQuery<CategoryPost[]>({
    queryKey: ['posts-by-category', categoryName, platform],
    enabled: !!categoryName,
    queryFn: async () => {
      const res = await api.api.posts.$get({
        query: platform ? { category: categoryName, platform } : { category: categoryName },
      })
      if (!res.ok) throw new Error(`Failed to load posts (${res.status})`)
      return res.json()
    },
    staleTime: 1000 * 60 * 5,
  })
}
