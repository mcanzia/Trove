import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed'
export type JobPhase = 'fetch_saved' | 'fetch_comments' | 'classify' | 'analyze' | 'sync' | 'done'

export interface SyncJob {
  id: string
  status: JobStatus
  phase: JobPhase | null
  counts: { fetched?: number; classified?: number; analyzed?: number }
  error: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

const isActive = (j?: SyncJob | null) => j?.status === 'pending' || j?.status === 'running'

/**
 * The caller's most recent sync job, with live updates. Subscribes to Supabase
 * Realtime on sync_jobs (RLS-scoped to the user) and refetches on change, with a
 * polling fallback while a job is in flight.
 */
export function useSyncJob() {
  const qc = useQueryClient()
  const query = useQuery<SyncJob | null>({
    queryKey: ['sync-job', 'latest'],
    queryFn: async () => {
      const res = await api.api['sync-jobs'].latest.$get()
      if (!res.ok) throw new Error(`Failed to load sync job (${res.status})`)
      return (await res.json()) as SyncJob | null
    },
    refetchInterval: (q) => (isActive(q.state.data) ? 2500 : false),
  })

  useEffect(() => {
    const channel = supabase
      .channel('sync_jobs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sync_jobs' }, () => {
        qc.invalidateQueries({ queryKey: ['sync-job', 'latest'] })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])

  return query
}

/** Enqueue a Reddit sync; returns the (new or in-flight) job. */
export async function enqueueSync(): Promise<SyncJob> {
  const res = await api.api['sync-jobs'].$post()
  if (!res.ok) throw new Error(`Couldn't start sync (${res.status})`)
  return (await res.json()) as SyncJob
}
