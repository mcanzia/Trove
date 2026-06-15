import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Connection {
  platform: string
  status: 'connected' | 'revoked' | 'error'
  reddit_username: string | null
  scopes: string | null
  connected_at: string | null
  last_synced_at: string | null
}

/** The caller's platform connections (Reddit, …). */
export function useConnections() {
  return useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: async () => {
      const res = await api.api.connections.$get()
      if (!res.ok) throw new Error(`Failed to load connections (${res.status})`)
      return ((await res.json()) as { connections: Connection[] }).connections
    },
    staleTime: 30_000,
  })
}

/** Store the user's pasted Reddit cookie (verified server-side before saving). */
export async function saveRedditCredential(cookie: string, username: string): Promise<void> {
  const res = await api.api.connections.reddit.credential.$post({ json: { cookie, username } })
  if (!res.ok) {
    const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error
    throw new Error(msg ?? `Couldn't save your Reddit cookie (${res.status})`)
  }
}

/** Disconnect Reddit — wipes the stored cookie + connection. */
export async function disconnectReddit(): Promise<void> {
  const res = await api.api.connections.reddit.$delete()
  if (!res.ok) throw new Error(`Couldn't disconnect Reddit (${res.status})`)
}
