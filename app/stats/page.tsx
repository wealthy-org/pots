'use client'

import { useReadContract } from 'wagmi'
import { DataSource } from '@/components/ui/data-source'
import { LeadStat } from '@/components/ui/lead-stat'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useProtocolStats } from '@/hooks/use-protocol-stats'
import { potsTokenAbi, tokenAddress } from '@/lib/contracts'
import { formatWeiToEth } from '@/lib/wei'

export default function StatsPage() {
  const totalSupply = useReadContract({
    address: tokenAddress,
    abi: potsTokenAbi,
    functionName: 'totalSupply',
  })
  const stats = useProtocolStats()
  const data = stats.data
  const potsEmittedValue =
    totalSupply.data !== undefined
      ? `${formatWeiToEth(totalSupply.data as bigint, 4)} POTS`
      : totalSupply.isError
        ? 'Unavailable'
        : 'Loading'

  return (
    <section aria-labelledby="stats-title" className="flex flex-col gap-4">
      <div>
        <h1 id="stats-title" className="text-2xl font-bold">
          Stats
        </h1>
        <p className="mt-1 max-w-prose text-sm text-text-2">
          Protocol counters. Each view names its source and the block it reflects; POTS emitted is
          always read from the token contract.
        </p>
      </div>

      {stats.isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {stats.isError ? (
        <Panel>
          <p className="text-sm text-text-2">
            Neither the indexer nor the RPC returned the counters. Try again in a moment.
          </p>
        </Panel>
      ) : null}

      {data ? (
        <>
          <LeadStat
            label="Total ETH committed"
            value={`${formatWeiToEth(data.stats.totalCommitted, 5)} ETH`}
          />
          <Panel>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <Stat label="Rounds completed" value={data.stats.rounds.toString()} />
              <Stat
                label="ETH distributed"
                value={`${formatWeiToEth(data.stats.distributed, 5)} ETH`}
              />
              <Stat
                label="Jackpot paid"
                value={`${formatWeiToEth(data.stats.jackpotPaid, 5)} ETH`}
              />
              <Stat
                label="POTS emitted"
                value={potsEmittedValue}
                note="Token contract, current supply"
              />
              <Stat label="Unique wallets" value={data.stats.uniqueWallets.toString()} />
            </dl>
            <div className="mt-4">
              <DataSource source={data.source} />
            </div>
          </Panel>
        </>
      ) : null}
    </section>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold tracking-[0.16em] text-text-3 uppercase">{label}</dt>
      <dd className="mt-0.5 font-mono text-base font-semibold">{value}</dd>
      {note ? <dd className="text-xs text-text-2">{note}</dd> : null}
    </div>
  )
}
