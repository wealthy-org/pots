'use client'

import { useQuery } from '@tanstack/react-query'
import { managerAddress } from '@/lib/contracts'
import { fetchLastJackpotRound, indexerEnabled, INDEXER_POLL_INTERVAL_MS } from '@/lib/indexer'

/** Latest jackpot round from the indexer; null when none or when no indexer is available. */
export function useLastJackpotRound() {
  return useQuery({
    queryKey: ['last-jackpot', managerAddress],
    enabled: indexerEnabled,
    queryFn: fetchLastJackpotRound,
    refetchInterval: INDEXER_POLL_INTERVAL_MS * 4,
    retry: false,
  })
}
