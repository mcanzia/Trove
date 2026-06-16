/**
 * Reclassify-on-demand: re-run extraction for one stored post against a chosen
 * category and add any new highlights it finds (purely additive). Rides the same
 * sync_jobs queue + GitHub Actions worker as a normal sync — we enqueue a
 * kind='reclassify' job, then poll it by id until it finishes.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Platform } from '@trove/shared'

export type ReclassifyStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface ReclassifyJob {
  id: string
  status: ReclassifyStatus
  phase: string | null
  counts: { found?: number; added?: number; no_results?: boolean }
  error: string | null
}

const isActive = (j?: ReclassifyJob | null) => j?.status === 'pending' || j?.status === 'running'

/** Enqueue a reclassify job. Throws 'pending_approval' if the user isn't approved. */
export async function startReclassify(input: {
  sourcePostId: string
  platform: Platform
  targetCategory: string
}): Promise<ReclassifyJob> {
  const res = await api.api['sync-jobs'].reclassify.$post({
    json: {
      sourcePostId: input.sourcePostId,
      platform: input.platform,
      targetCategory: input.targetCategory,
    },
  })
  if (!res.ok) {
    if (res.status === 403) throw new Error('pending_approval')
    throw new Error(`Couldn't start reclassify (${res.status})`)
  }
  return (await res.json()) as ReclassifyJob
}

/** Poll one job by id; stops refetching once it's no longer active. */
export function useJobById(jobId: string | null) {
  return useQuery<ReclassifyJob | null>({
    queryKey: ['sync-job', 'by-id', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const res = await api.api['sync-jobs'][':id'].$get({ param: { id: jobId! } })
      if (!res.ok) throw new Error(`Failed to load job (${res.status})`)
      return (await res.json()) as ReclassifyJob | null
    },
    refetchInterval: (q) => (isActive(q.state.data) ? 2000 : false),
  })
}
