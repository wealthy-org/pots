'use client'

import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { collectLogs } from '@/lib/contract-reads'
import { entryPlacedEvent, roundSettledEvent } from '@/lib/contract-events'
import { managerAddress } from '@/lib/contracts'
import { CONTRACT_SCAN_INTERVAL_MS, indexerEnabled } from '@/lib/indexer'
import { shareAmount } from '@/lib/shares'

export type SettledRound = {
  roundId: bigint
  winningSquare: number
  totalEth: bigint
  winningSquareEth: bigint
  pool: bigint
  rolloverOut: bigint
  jackpotHit: boolean
}

export type WinnerRow = {
  wallet: `0x${string}`
  entryWei: bigint
  ethWei: bigint
}

export type SettledRoundsData = {
  rounds: SettledRound[]
  winners: WinnerRow[]
}

export function useSettledRounds(limit = 3) {
  const client = usePublicClient()

  return useQuery<SettledRoundsData>({
    queryKey: ['settled-rounds', managerAddress, limit],
    enabled: Boolean(client),
    refetchInterval: indexerEnabled ? CONTRACT_SCAN_INTERVAL_MS : 10000,
    queryFn: async () => {
      if (!client) {
        return { rounds: [], winners: [] }
      }
      const head = await client.getBlockNumber()
      const logs = await collectLogs(head, (range) =>
        client.getLogs({ address: managerAddress, event: roundSettledEvent, ...range }),
      )
      const rounds: SettledRound[] = logs
        .slice(-limit)
        .reverse()
        .map((log) => ({
          roundId: log.args.roundId ?? 0n,
          winningSquare: Number(log.args.winningSquare ?? 0),
          totalEth: log.args.totalEth ?? 0n,
          winningSquareEth: log.args.winningSquareEth ?? 0n,
          pool: log.args.pool ?? 0n,
          rolloverOut: log.args.rolloverOut ?? 0n,
          jackpotHit: log.args.jackpotHit ?? false,
        }))

      const latest = rounds[0]
      if (!latest || latest.winningSquareEth === 0n) {
        return { rounds, winners: [] }
      }

      const entries = await collectLogs(head, (range) =>
        client.getLogs({
          address: managerAddress,
          event: entryPlacedEvent,
          args: { roundId: latest.roundId },
          ...range,
        }),
      )

      const byWallet = new Map<string, bigint>()
      for (const entry of entries) {
        const squares = entry.args.squareIds
        const amountPerSquare = entry.args.amountPerSquare
        const wallet = entry.args.wallet
        if (!squares || amountPerSquare === undefined || !wallet) {
          continue
        }
        if (!squares.includes(latest.winningSquare)) {
          continue
        }
        const key = wallet.toLowerCase()
        byWallet.set(key, (byWallet.get(key) ?? 0n) + amountPerSquare)
      }

      const winners: WinnerRow[] = Array.from(byWallet.entries())
        .map(([wallet, entryWei]) => ({
          wallet: wallet as `0x${string}`,
          entryWei,
          ethWei: shareAmount(latest.pool, entryWei, latest.winningSquareEth),
        }))
        .sort((a, b) => (b.ethWei > a.ethWei ? 1 : -1))
        .slice(0, 8)

      return { rounds, winners }
    },
  })
}
