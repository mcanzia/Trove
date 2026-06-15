import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type AccessStatus = 'pending' | 'approved' | 'blocked'

/** The caller's own sync-feature approval status. */
export function useAccess() {
  return useQuery<AccessStatus>({
    queryKey: ['access'],
    queryFn: async () => {
      const res = await api.api.access.$get()
      if (!res.ok) throw new Error(`Failed to load access status (${res.status})`)
      return ((await res.json()) as { status: AccessStatus }).status
    },
    staleTime: 60_000,
  })
}
