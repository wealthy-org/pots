'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchRoundMiners, indexerEnabled, INDEXER_POLL_INTERVAL_MS } from '@/lib/indexer'
import { managerAddress } from '@/lib/contracts'

/**
 * Miner counts for a round from the indexer. They are optional: without an indexer, or when the
 * indexer fails, the UI shows no count instead of a guess.
 */
export function useRoundMiners(roundId?: bigint) {
  return useQuery({
    queryKey: ['round-miners', managerAddress, roundId?.toString()],
    enabled: indexerEnabled && roundId !== undefined && roundId > 0n,
    queryFn: () => fetchRoundMiners(roundId as bigint),
    refetchInterval: INDEXER_POLL_INTERVAL_MS,
    retry: false,
  })
}
