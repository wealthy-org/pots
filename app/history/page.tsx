'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parseAbiItem } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { managerAddress } from '@/lib/contracts'
import { formatWeiToEth } from '@/lib/wei'
import { netEth } from '@/lib/shares'

const entryEvent = parseAbiItem(
  'event EntryPlaced(uint256 indexed roundId, address indexed wallet, uint8[] squareIds, uint256 amountPerSquare, uint256 total)',
)
const rewardClaimedEvent = parseAbiItem(
  'event RewardClaimed(uint256 indexed roundId, address indexed wallet, uint8 kind, uint256 amount)',
)
const refundClaimedEvent = parseAbiItem(
  'event RefundClaimed(uint256 indexed roundId, address indexed wallet, uint256 amount)',
)
const settledEvent = parseAbiItem(
  'event RoundSettled(uint256 indexed roundId, uint8 winningSquare, uint256 totalEth, uint256 winningSquareEth, uint256 pool, uint256 rolloverOut, bool jackpotHit)',
)

type RoundRow = {
  roundId: bigint
  deposited: bigint
  claimedEth: bigint
  claimedPots: bigint
  winningSquare: number | null
}

export default function HistoryPage() {
  const { address, isConnected } = useAccount()
  const client = usePublicClient()

  const history = useQuery({
    queryKey: ['wallet-history', managerAddress, address],
    enabled: Boolean(client) && Boolean(address),
    refetchInterval: 15000,
    queryFn: async () => {
      if (!client || !address) {
        return []
      }
      const [entries, rewards, refunds, settled] = await Promise.all([
        client.getLogs({
          address: managerAddress,
          event: entryEvent,
          args: { wallet: address },
          fromBlock: 0n,
        }),
        client.getLogs({
          address: managerAddress,
          event: rewardClaimedEvent,
          args: { wallet: address },
          fromBlock: 0n,
        }),
        client.getLogs({
          address: managerAddress,
          event: refundClaimedEvent,
          args: { wallet: address },
          fromBlock: 0n,
        }),
        client.getLogs({ address: managerAddress, event: settledEvent, fromBlock: 0n }),
      ])

      const winningByRound = new Map<string, number>()
      for (const log of settled) {
        if (log.args.roundId !== undefined && log.args.winningSquare !== undefined) {
          winningByRound.set(log.args.roundId.toString(), Number(log.args.winningSquare))
        }
      }

      const rows = new Map<string, RoundRow>()
      const ensure = (roundId: bigint): RoundRow => {
        const key = roundId.toString()
        const existing = rows.get(key)
        if (existing) {
          return existing
        }
        const row: RoundRow = {
          roundId,
          deposited: 0n,
          claimedEth: 0n,
          claimedPots: 0n,
          winningSquare: winningByRound.get(key) ?? null,
        }
        rows.set(key, row)
        return row
      }

      for (const log of entries) {
        if (log.args.roundId === undefined) continue
        ensure(log.args.roundId).deposited += log.args.total ?? 0n
      }
      for (const log of rewards) {
        if (log.args.roundId === undefined) continue
        const row = ensure(log.args.roundId)
        if (Number(log.args.kind) === 0) {
          row.claimedEth += log.args.amount ?? 0n
        } else {
          row.claimedPots += log.args.amount ?? 0n
        }
      }
      for (const log of refunds) {
        if (log.args.roundId === undefined) continue
        ensure(log.args.roundId).claimedEth += log.args.amount ?? 0n
      }

      return Array.from(rows.values()).sort((a, b) => (a.roundId > b.roundId ? -1 : 1))
    },
  })

  const net = useMemo(
    () =>
      (history.data ?? []).reduce((sum, row) => sum + netEth(row.claimedEth, row.deposited), 0n),
    [history.data],
  )

  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-4">
      <div>
        <h1 id="history-title" className="text-2xl font-bold">
          History
        </h1>
        <p className="mt-1 max-w-prose text-sm text-text-2">
          Rounds and outcomes for the connected wallet, read from contract events.
        </p>
      </div>

      {!isConnected ? (
        <EmptyState
          title="Connect a wallet"
          description="Personal history appears after a wallet is connected."
        />
      ) : null}

      {isConnected && history.isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {isConnected && history.isError ? (
        <EmptyState
          title="History read failed"
          description="The RPC could not scan the full event range. History arrives with the indexer."
        />
      ) : null}

      {isConnected && history.data?.length === 0 ? (
        <EmptyState
          title="No entries yet"
          description="Enter a round on the Mine page and it will appear here."
        />
      ) : null}

      {isConnected && history.data && history.data.length > 0 ? (
        <Panel className="p-0">
          <div className="grid grid-cols-[70px_1fr_1fr_1fr_90px] gap-2 border-b border-line px-3 py-2 text-[10px] font-semibold tracking-[0.12em] text-text-3 uppercase">
            <span>Round</span>
            <span className="text-right">Deposited</span>
            <span className="text-right">Claimed ETH</span>
            <span className="text-right">Claimed POTS</span>
            <span className="text-right">Net ETH</span>
          </div>
          {history.data.map((row) => {
            const rowNet = netEth(row.claimedEth, row.deposited)
            return (
              <div
                key={row.roundId.toString()}
                className="grid grid-cols-[70px_1fr_1fr_1fr_90px] items-center gap-2 border-b border-white/5 px-3 py-2 font-mono text-xs"
              >
                <span className="text-text-2">
                  #{row.roundId.toString()}
                  {row.winningSquare ? ` · sq ${row.winningSquare}` : ''}
                </span>
                <span className="text-right text-text-2">{formatWeiToEth(row.deposited, 4)}</span>
                <span className="text-right text-text-2">{formatWeiToEth(row.claimedEth, 4)}</span>
                <span className="text-right text-text-2">{formatWeiToEth(row.claimedPots, 3)}</span>
                <span className={`text-right ${rowNet >= 0n ? 'text-live' : 'text-loss'}`}>
                  {formatWeiToEth(rowNet, 4)}
                </span>
              </div>
            )
          })}
          <div className="flex justify-between px-3 py-2 text-xs text-text-2">
            <span>Net ETH across rounds</span>
            <span className={`font-mono ${net >= 0n ? 'text-live' : 'text-loss'}`}>
              {formatWeiToEth(net, 4)} ETH
            </span>
          </div>
        </Panel>
      ) : null}
    </section>
  )
}
