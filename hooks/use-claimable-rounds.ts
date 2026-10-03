'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { useWalletHistory } from '@/hooks/use-wallet-history'
import { managerAddress, roundManagerAbi } from '@/lib/contracts'

export type ClaimableRound = { roundId: bigint; eth: bigint; pots: bigint }

/**
 * Rounds of the wallet with something left to claim, oldest first. A reward stays claimable after
 * the keeper has started later rounds, so the claim controls cannot depend on the current round
 * alone. The wallet's rounds come from the same read as History (indexer first, contract fallback);
 * `getClaimable` on the contract decides what is claimable.
 */
export function useClaimableRounds(wallet?: `0x${string}`, limit = 15) {
  const history = useWalletHistory(wallet)
  const ids = useMemo(
    () =>
      (history.data?.rows ?? [])
        .filter((row) => row.deposited > 0n)
        .slice(0, limit)
        .map((row) => row.roundId),
    [history.data, limit],
  )
  const reads = useReadContracts({
    contracts: ids.map((roundId) => ({
      address: managerAddress,
      abi: roundManagerAbi,
      functionName: 'getClaimable',
      args: [roundId, wallet],
    })),
    query: { enabled: ids.length > 0 && wallet !== undefined, refetchInterval: 15000 },
  })

  const rounds = useMemo<ClaimableRound[]>(() => {
    const list: ClaimableRound[] = []
    ids.forEach((roundId, index) => {
      const item = reads.data?.[index]
      if (item?.status !== 'success') {
        return
      }
      const [eth, pots] = item.result as readonly [bigint, bigint]
      if (eth > 0n || pots > 0n) {
        list.push({ roundId, eth, pots })
      }
    })
    return list.sort((a, b) => (a.roundId < b.roundId ? -1 : 1))
  }, [ids, reads.data])

  return { rounds, refetch: reads.refetch, isLoading: history.isLoading || reads.isLoading }
}
