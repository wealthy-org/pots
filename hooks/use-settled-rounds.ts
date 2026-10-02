'use client'

import { useQuery } from '@tanstack/react-query'
import { parseAbiItem } from 'viem'
import { usePublicClient } from 'wagmi'
import { managerAddress } from '@/lib/contracts'
import { shareAmount } from '@/lib/shares'

const settledEvent = parseAbiItem(
  'event RoundSettled(uint256 indexed roundId, uint8 winningSquare, uint256 totalEth, uint256 winningSquareEth, uint256 pool, uint256 rolloverOut, bool jackpotHit)',
)
const entryEvent = parseAbiItem(
  'event EntryPlaced(uint256 indexed roundId, address indexed wallet, uint8[] squareIds, uint256 amountPerSquare, uint256 total)',
)

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
    refetchInterval: 10000,
    queryFn: async () => {
      if (!client) {
        return { rounds: [], winners: [] }
      }
      const logs = await client.getLogs({
        address: managerAddress,
        event: settledEvent,
        fromBlock: 0n,
      })
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

      const entries = await client.getLogs({
        address: managerAddress,
        event: entryEvent,
        args: { roundId: latest.roundId },
        fromBlock: 0n,
      })

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
