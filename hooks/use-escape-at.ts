'use client'

import { useCancelWindows } from '@/hooks/use-round'
import { Phase, type RoundData } from '@/lib/types'

/** Timestamp from which anyone may cancel a stuck round, or undefined when no escape applies yet. */
export function useEscapeAt(roundId: bigint | undefined, round?: RoundData): bigint | undefined {
  const cancelWindows = useCancelWindows(roundId, round?.phase)

  if (
    round?.phase === Phase.LOCKED &&
    cancelWindows.lockedCancelDelay !== undefined &&
    cancelWindows.lockedAt
  ) {
    return cancelWindows.lockedAt + cancelWindows.lockedCancelDelay
  }
  if (
    round?.phase === Phase.RANDOMNESS_PENDING &&
    cancelWindows.forceCancelDelay !== undefined &&
    cancelWindows.requestedAt
  ) {
    return cancelWindows.requestedAt + cancelWindows.forceCancelDelay
  }
  return undefined
}
