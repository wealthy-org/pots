'use client'

import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { readCurrentRoundId, readProtocolStatsFromContract } from '@/lib/contract-reads'
import { managerAddress } from '@/lib/contracts'
import type { DataSourceInfo } from '@/lib/data-source'
import { createFallbackState, readIndexerFirst, warnIndexerDisabled } from '@/lib/indexer-fallback'
import {
  CONTRACT_SCAN_INTERVAL_MS,
  fetchProtocolStats,
  INDEXER_POLL_INTERVAL_MS,
  indexerEnabled,
  type ProtocolStatsView,
} from '@/lib/indexer'

const indexerState = createFallbackState()

export type ProtocolStatsData = {
  stats: ProtocolStatsView
  source: DataSourceInfo
}

export function useProtocolStats() {
  const client = usePublicClient()

  return useQuery<ProtocolStatsData>({
    queryKey: ['protocol-stats', managerAddress],
    enabled: Boolean(client),
    retry: false,
    refetchInterval: (query) =>
      indexerEnabled && query.state.data?.source.kind === 'contract'
        ? CONTRACT_SCAN_INTERVAL_MS
        : INDEXER_POLL_INTERVAL_MS,
    queryFn: async () => {
      if (!client) {
        throw new Error('Protocol stats need a public client.')
      }
      const result = await readIndexerFirst({
        enabled: indexerEnabled,
        state: indexerState,
        onTerminal: warnIndexerDisabled,
        readChainHead: () => client.getBlockNumber(),
        readCurrentRoundId: () => readCurrentRoundId(client),
        readIndexer: async (currentRoundId) => {
          const { stats, ...freshness } = await fetchProtocolStats(currentRoundId)
          return { value: stats, ...freshness }
        },
        readContract: () => readProtocolStatsFromContract(client),
      })
      return { stats: result.value, source: result.source }
    },
  })
}
