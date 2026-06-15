import { Check, Ban, Clock, Users } from 'lucide-react'
import { useAdminUsers, useSetUserStatus, type AdminUser } from '@/hooks/useAdminUsers'
import type { AccessStatus } from '@/hooks/useAccess'

function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const d = Date.now() - new Date(iso).getTime()
  const day = Math.floor(d / 86_400_000)
  if (day > 0) return `${day}d ago`
  const h = Math.floor(d / 3_600_000)
  if (h > 0) return `${h}h ago`
  return 'recently'
}

const STATUS_STYLES: Record<AccessStatus, { dot: string; text: string; label: string }> = {
  approved: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', label: 'Approved' },
  pending: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', label: 'Pending' },
  blocked: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', label: 'Blocked' },
}

function StatusChip({ status }: { status: AccessStatus }) {
  const s = STATUS_STYLES[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden /> {s.label}
    </span>
  )
}

function Actions({ user }: { user: AdminUser }) {
  const setStatus = useSetUserStatus()
  const busy = setStatus.isPending
  const set = (status: AccessStatus) => setStatus.mutate({ id: user.id, status })

  const btn = 'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <div className="flex justify-end gap-1.5">
      {user.status !== 'approved' && (
        <button type="button" onClick={() => set('approved')} disabled={busy}
          className={`${btn} hover:bg-emerald-500/10 hover:text-emerald-600`}>
          <Check size={13} /> Approve
        </button>
      )}
      {user.status !== 'blocked' && (
        <button type="button" onClick={() => set('blocked')} disabled={busy}
          className={`${btn} hover:bg-red-500/10 hover:text-red-600`}>
          <Ban size={13} /> Block
        </button>
      )}
      {user.status === 'blocked' && (
        <button type="button" onClick={() => set('pending')} disabled={busy} className={`${btn} hover:bg-muted`}>
          <Clock size={13} /> Pending
        </button>
      )}
    </div>
  )
}

export function UsersPanel() {
  const { data: users, isLoading, error } = useAdminUsers()
  const pendingCount = users?.filter((u) => u.status === 'pending').length ?? 0

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center gap-2">
        <Users size={16} className="text-muted-foreground" aria-hidden />
        <h2 className="font-display text-lg font-semibold text-foreground">Users &amp; access</h2>
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            {pendingCount} pending
          </span>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">Couldn’t load users.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !users?.length ? (
        <p className="text-sm text-muted-foreground">No users yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Joined</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="truncate text-foreground">{u.email ?? '(no email)'}</div>
                  </td>
                  <td className="px-4 py-2.5"><StatusChip status={u.status} /></td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{relTime(u.created_at)}</td>
                  <td className="px-4 py-2.5"><Actions user={u} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
