'use client'

import { useReadContract } from 'wagmi'
import { managerAddress, roundManagerAbi } from '@/lib/contracts'
import type { RoundData, WalletRoundData } from '@/lib/types'

const refetchInterval = 5000

export function useCurrentRoundId() {
  return useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'currentRoundId',
    query: { refetchInterval },
  })
}

export function useRound(roundId?: bigint) {
  const result = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'getRound',
    args: roundId !== undefined ? [roundId] : undefined,
    query: { refetchInterval, enabled: roundId !== undefined },
  })
  return { ...result, round: result.data as unknown as RoundData | undefined }
}

export function useSquareTotals(roundId?: bigint) {
  return useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'getSquareTotals',
    args: roundId !== undefined ? [roundId] : undefined,
    query: { refetchInterval, enabled: roundId !== undefined },
  })
}

export function useBalances() {
  return useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'balances',
    query: { refetchInterval },
  })
}

export function useClaimable(roundId: bigint | undefined, wallet?: `0x${string}`) {
  return useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'getClaimable',
    args: roundId !== undefined && wallet ? [roundId, wallet] : undefined,
    query: { refetchInterval, enabled: roundId !== undefined && wallet !== undefined },
  })
}

export function useWalletRound(roundId: bigint | undefined, wallet?: `0x${string}`) {
  const result = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'getWalletRound',
    args: roundId !== undefined && wallet ? [roundId, wallet] : undefined,
    query: { refetchInterval, enabled: roundId !== undefined && wallet !== undefined },
  })
  return { ...result, walletRound: result.data as unknown as WalletRoundData | undefined }
}

export function useEntryLimits() {
  const min = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'minEntryPerSquare',
  })
  const max = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'maxEntryPerSquare',
  })
  return {
    minWei: min.data as bigint | undefined,
    maxWei: max.data as bigint | undefined,
  }
}
