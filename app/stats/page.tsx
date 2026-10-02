'use client'

import { useQuery } from '@tanstack/react-query'
import { parseAbiItem } from 'viem'
import { usePublicClient, useReadContract } from 'wagmi'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { managerAddress, potsTokenAbi, tokenAddress } from '@/lib/contracts'
import { formatWeiToEth } from '@/lib/wei'

const entryEvent = parseAbiItem(
  'event EntryPlaced(uint256 indexed roundId, address indexed wallet, uint8[] squareIds, uint256 amountPerSquare, uint256 total)',
)
const settledEvent = parseAbiItem(
  'event RoundSettled(uint256 indexed roundId, uint8 winningSquare, uint256 totalEth, uint256 winningSquareEth, uint256 pool, uint256 rolloverOut, bool jackpotHit)',
)
const jackpotEvent = parseAbiItem('event JackpotPaid(uint256 indexed roundId, uint256 amount)')

export default function StatsPage() {
  const client = usePublicClient()
  const totalSupply = useReadContract({
    address: tokenAddress,
    abi: potsTokenAbi,
    functionName: 'totalSupply',
  })

  const stats = useQuery({
    queryKey: ['protocol-stats', managerAddress],
    enabled: Boolean(client),
    refetchInterval: 15000,
    queryFn: async () => {
      if (!client) {
        return null
      }
      const [entries, settled, jackpots, blockNumber] = await Promise.all([
        client.getLogs({ address: managerAddress, event: entryEvent, fromBlock: 0n }),
        client.getLogs({ address: managerAddress, event: settledEvent, fromBlock: 0n }),
        client.getLogs({ address: managerAddress, event: jackpotEvent, fromBlock: 0n }),
        client.getBlockNumber(),
      ])

      const totalCommitted = entries.reduce((sum, log) => sum + (log.args.total ?? 0n), 0n)
      const distributed = settled.reduce((sum, log) => sum + (log.args.pool ?? 0n), 0n)
      const jackpotPaid = jackpots.reduce((sum, log) => sum + (log.args.amount ?? 0n), 0n)
      const wallets = new Set(entries.map((log) => log.args.wallet?.toLowerCase()).filter(Boolean))

      return {
        totalCommitted,
        rounds: settled.length,
        distributed,
        jackpotPaid,
        uniqueWallets: wallets.size,
        entries: entries.length,
        lastBlock: blockNumber,
      }
    },
  })

  return (
    <section aria-labelledby="stats-title" className="flex flex-col gap-4">
      <div>
        <h1 id="stats-title" className="text-2xl font-bold">
          Stats
        </h1>
        <p className="mt-1 max-w-prose text-sm text-text-2">
          Counters derived from contract events. Values show the last indexed block; the indexer
          will replace this direct read in a later phase.
        </p>
      </div>

      {stats.isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {stats.isError ? (
        <Panel>
          <p className="text-sm text-text-2">
            This RPC could not scan the full event range. Stats stay available after the indexer is
            live.
          </p>
        </Panel>
      ) : null}

      {stats.data ? (
        <Panel>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <Stat
              label="Total ETH committed"
              value={`${formatWeiToEth(stats.data.totalCommitted, 5)} ETH`}
            />
            <Stat label="Rounds completed" value={stats.data.rounds.toString()} />
            <Stat
              label="ETH distributed"
              value={`${formatWeiToEth(stats.data.distributed, 5)} ETH`}
            />
            <Stat label="Jackpot paid" value={`${formatWeiToEth(stats.data.jackpotPaid, 5)} ETH`} />
            <Stat
              label="POTS emitted"
              value={`${formatWeiToEth((totalSupply.data as bigint | undefined) ?? 0n, 4)} POTS`}
            />
            <Stat label="Unique wallets" value={stats.data.uniqueWallets.toString()} />
          </dl>
          <p className="mt-4 font-mono text-[10px] text-text-3">
            entries {stats.data.entries} · last block {stats.data.lastBlock.toString()}
          </p>
        </Panel>
      ) : null}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.14em] text-text-3 uppercase">{label}</dt>
      <dd className="mt-0.5 font-mono text-base font-semibold">{value}</dd>
    </div>
  )
}
