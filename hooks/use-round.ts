'use client'

import { useReadContract } from 'wagmi'
import { managerAddress, roundManagerAbi } from '@/lib/contracts'
import { Phase, type RoundData, type WalletRoundData } from '@/lib/types'

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

export function usePaused() {
  return useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'paused',
    query: { refetchInterval },
  })
}

export function useCancelWindows(roundId: bigint | undefined, phase: number | undefined) {
  const locked = phase === Phase.LOCKED
  const pending = phase === Phase.RANDOMNESS_PENDING
  const lockedDelay = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'lockedCancelDelay',
    query: { enabled: locked },
  })
  const forceDelay = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'forceCancelDelay',
    query: { enabled: pending },
  })
  const lockedAt = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'lockedAtTime',
    args: roundId !== undefined ? [roundId] : undefined,
    query: { enabled: roundId !== undefined && locked },
  })
  const requestedAt = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'requestedAtTime',
    args: roundId !== undefined ? [roundId] : undefined,
    query: { enabled: roundId !== undefined && pending },
  })
  return {
    lockedCancelDelay: lockedDelay.data as bigint | undefined,
    forceCancelDelay: forceDelay.data as bigint | undefined,
    lockedAt: lockedAt.data as bigint | undefined,
    requestedAt: requestedAt.data as bigint | undefined,
  }
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

/** Round window in seconds, read from the contract (60 on mainnet). Used for the timer scale. */
export function useRoundWindow() {
  const result = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'roundWindow',
  })
  return result.data !== undefined ? Number(result.data as number | bigint) : undefined
}
