'use client'

import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { readCurrentRoundId, readWalletHistoryFromContract } from '@/lib/contract-reads'
import { managerAddress } from '@/lib/contracts'
import type { DataSourceInfo } from '@/lib/data-source'
import { createFallbackState, readIndexerFirst, warnIndexerDisabled } from '@/lib/indexer-fallback'
import {
  CONTRACT_SCAN_INTERVAL_MS,
  fetchWalletHistory,
  HISTORY_ROW_LIMIT,
  INDEXER_POLL_INTERVAL_MS,
  indexerEnabled,
  type WalletRoundRow,
} from '@/lib/indexer'

const indexerState = createFallbackState()

export type WalletHistoryData = {
  rows: WalletRoundRow[]
  source: DataSourceInfo
  truncated: boolean
}

export function useWalletHistory(wallet: `0x${string}` | undefined) {
  const client = usePublicClient()

  return useQuery<WalletHistoryData>({
    queryKey: ['wallet-history', managerAddress, wallet],
    enabled: Boolean(client) && Boolean(wallet),
    retry: false,
    refetchInterval: (query) =>
      indexerEnabled && query.state.data?.source.kind === 'contract'
        ? CONTRACT_SCAN_INTERVAL_MS
        : INDEXER_POLL_INTERVAL_MS,
    queryFn: async () => {
      if (!client || !wallet) {
        throw new Error('Wallet history needs a connected wallet and a public client.')
      }
      const result = await readIndexerFirst({
        enabled: indexerEnabled,
        state: indexerState,
        onTerminal: warnIndexerDisabled,
        readChainHead: () => client.getBlockNumber(),
        readCurrentRoundId: () => readCurrentRoundId(client),
        readIndexer: async (currentRoundId) => {
          const { rows, ...freshness } = await fetchWalletHistory(wallet, currentRoundId)
          return { value: rows, ...freshness }
        },
        readContract: () => readWalletHistoryFromContract(client, wallet),
      })
      return {
        rows: result.value,
        source: result.source,
        truncated: result.source.kind === 'indexer' && result.value.length >= HISTORY_ROW_LIMIT,
      }
    },
  })
}
