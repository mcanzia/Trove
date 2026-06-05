/**
 * Reads pre-verified Amazon storefront URLs for Instagram accounts
 * that post product content. Populated by the Python sync script.
 *
 * Returns a Map<instagramOwner, storefrontUrl>.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useInstagramStorefronts() {
  return useQuery({
    queryKey: ['instagram-storefronts'],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from('instagram_storefronts')
        .select('owner, storefront_url')
      if (error) throw error
      return new Map((data ?? []).map((r) => [r.owner as string, r.storefront_url as string]))
    },
    staleTime: 1000 * 60 * 60, // 1 hour — storefronts don't change often
  })
}
