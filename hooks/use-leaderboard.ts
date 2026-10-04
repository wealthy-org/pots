'use client'

import { useQuery } from '@tanstack/react-query'
import {
  fetchLeaderboard,
  fetchReferralEarnings,
  indexerEnabled,
  INDEXER_POLL_INTERVAL_MS,
} from '@/lib/indexer'

const LEADERBOARD_REFETCH_MS = INDEXER_POLL_INTERVAL_MS * 2

/** All-time ranking by POTS mined. The indexer is the only source: there is no contract fallback. */
export function useLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard'],
    enabled: indexerEnabled,
    retry: false,
    refetchInterval: LEADERBOARD_REFETCH_MS,
    queryFn: () => fetchLeaderboard(),
  })
}

/** Referral earnings of a wallet: tagged wallets and the POTS bonus minted to it. */
export function useReferralEarnings(wallet?: string) {
  return useQuery({
    queryKey: ['referral-earnings', wallet?.toLowerCase()],
    enabled: indexerEnabled && Boolean(wallet),
    retry: false,
    refetchInterval: LEADERBOARD_REFETCH_MS,
    queryFn: () => fetchReferralEarnings(wallet ?? ''),
  })
}
