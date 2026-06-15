import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AccessStatus } from '@/hooks/useAccess'

export interface AdminUser {
  id: string
  email: string | null
  created_at: string
  last_sign_in_at: string | null
  status: AccessStatus
  approved_at: string | null
}

/** All accounts + approval status (admin only). */
export function useAdminUsers() {
  return useQuery<AdminUser[]>({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await api.api.admin.users.$get()
      if (!res.ok) throw new Error(`Failed to load users (${res.status})`)
      return ((await res.json()) as { users: AdminUser[] }).users
    },
  })
}

/** Set a user's approval status; refreshes the list. */
export function useSetUserStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AccessStatus }) => {
      const res = await api.api.admin.users[':id'].$post({ param: { id }, json: { status } })
      if (!res.ok) throw new Error(`Failed to update user (${res.status})`)
      return (await res.json()) as { ok: boolean; status: AccessStatus }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
}
