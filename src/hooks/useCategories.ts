import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Category } from '@/types'

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name')

      if (error) throw error
      return (data as Category[]).map((cat) => ({
        ...cat,
        output_fields: typeof cat.output_fields === 'string'
          ? JSON.parse(cat.output_fields)
          : cat.output_fields,
        group_by: typeof cat.group_by === 'string'
          ? JSON.parse(cat.group_by)
          : cat.group_by,
      }))
    },
  })
}
