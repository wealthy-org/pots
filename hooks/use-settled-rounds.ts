'use client'

import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { collectLogs } from '@/lib/contract-reads'
import { entryPlacedEvent, roundSettledEvent } from '@/lib/contract-events'
import { managerAddress, roundManagerAbi } from '@/lib/contracts'
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
  /** How many blocks the wallet deployed on in the round. */
  blocks: number
  /** POTS share by the same weights as the ETH pool. */
  potsWei: bigint
}

type SettledRoundsData = {
  rounds: SettledRound[]
  /** The largest shares, at most WINNER_ROWS. */
  winners: WinnerRow[]
  /** All wallets with ETH on the winning block, so the label and TOP do not depend on the cap. */
  winnersTotal: number
  largestEntryWei: bigint
}

// tradeoff: the list shows the eight largest shares; the full count is kept for the label.
const WINNER_ROWS = 8

export function useSettledRounds(limit = 3) {
  const client = usePublicClient()

  return useQuery<SettledRoundsData>({
    queryKey: ['settled-rounds', managerAddress, limit],
    enabled: Boolean(client),
    refetchInterval: indexerEnabled ? CONTRACT_SCAN_INTERVAL_MS : 10000,
    queryFn: async () => {
      if (!client) {
        return { rounds: [], winners: [], winnersTotal: 0, largestEntryWei: 0n }
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
        return { rounds, winners: [], winnersTotal: 0, largestEntryWei: 0n }
      }

      const entries = await collectLogs(head, (range) =>
        client.getLogs({
          address: managerAddress,
          event: entryPlacedEvent,
          args: { roundId: latest.roundId },
          ...range,
        }),
      )

      const emission = (await client.readContract({
        address: managerAddress,
        abi: roundManagerAbi,
        functionName: 'potEmissionPerRound',
      })) as bigint

      const byWallet = new Map<string, { entryWei: bigint; blocks: Set<number> }>()
      for (const entry of entries) {
        const squares = entry.args.squareIds
        const amountPerSquare = entry.args.amountPerSquare
        const wallet = entry.args.wallet
        if (!squares || amountPerSquare === undefined || !wallet) {
          continue
        }
        const key = wallet.toLowerCase()
        const row = byWallet.get(key) ?? { entryWei: 0n, blocks: new Set<number>() }
        for (const square of squares) {
          row.blocks.add(Number(square))
        }
        if (squares.includes(latest.winningSquare)) {
          row.entryWei += amountPerSquare
        }
        byWallet.set(key, row)
      }

      const winners: WinnerRow[] = Array.from(byWallet.entries())
        .filter(([, row]) => row.entryWei > 0n)
        .map(([wallet, row]) => ({
          wallet: wallet as `0x${string}`,
          entryWei: row.entryWei,
          ethWei: shareAmount(latest.pool, row.entryWei, latest.winningSquareEth),
          blocks: row.blocks.size,
          potsWei: shareAmount(emission, row.entryWei, latest.winningSquareEth),
        }))
        .sort((a, b) => {
          if (a.entryWei !== b.entryWei) {
            return a.entryWei > b.entryWei ? -1 : 1
          }
          return a.wallet < b.wallet ? -1 : 1
        })

      return {
        rounds,
        winners: winners.slice(0, WINNER_ROWS),
        winnersTotal: winners.length,
        largestEntryWei: winners[0]?.entryWei ?? 0n,
      }
    },
  })
}
