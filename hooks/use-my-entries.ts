'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { managerAddress, roundManagerAbi } from '@/lib/contracts'

/**
 * ETH the connected wallet deployed on each block of a round (index 0 is block 1). Entries only
 * change when the wallet transacts or the round changes, so the poll is slow and the page
 * refetches after its own confirmed transactions.
 */
export function useMyEntries(roundId?: bigint, wallet?: `0x${string}`) {
  const enabled = roundId !== undefined && roundId > 0n && wallet !== undefined
  const result = useReadContracts({
    contracts: Array.from({ length: 25 }, (_, index) => ({
      address: managerAddress,
      abi: roundManagerAbi,
      functionName: 'getEntry',
      args: enabled ? [roundId, index + 1, wallet] : undefined,
    })),
    query: { enabled, refetchInterval: 15000 },
  })
  const entries = useMemo<Array<bigint | null>>(
    () =>
      Array.from({ length: 25 }, (_, index) => {
        const item = result.data?.[index]
        return item?.status === 'success' ? (item.result as bigint) : null
      }),
    [result.data],
  )
  return { ...result, entries }
}
