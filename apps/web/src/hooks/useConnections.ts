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

/** Kick off the Reddit OAuth flow — redirects the browser to Reddit. */
export async function startRedditConnect(): Promise<void> {
  const res = await api.api.connections.reddit.start.$post()
  if (!res.ok) throw new Error(`Couldn't start Reddit connect (${res.status})`)
  const { url } = (await res.json()) as { url: string }
  window.location.href = url
}
