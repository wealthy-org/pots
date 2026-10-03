'use client'

import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { DataSource } from '@/components/ui/data-source'
import { EmptyState } from '@/components/ui/empty-state'
import { LeadStat } from '@/components/ui/lead-stat'
import { Skeleton } from '@/components/ui/skeleton'
import { useWalletHistory } from '@/hooks/use-wallet-history'
import { shortenAddress } from '@/lib/format'
import { HISTORY_ROW_LIMIT } from '@/lib/indexer'
import { netEth } from '@/lib/shares'
import { formatWeiToEth } from '@/lib/wei'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-line bg-bg-elev px-3 py-3">
      <dt className="text-[11px] font-semibold tracking-[0.16em] text-text-3 uppercase">{label}</dt>
      <dd className="font-mono text-sm font-semibold break-words sm:text-base">{value}</dd>
    </div>
  )
}

/**
 * Player profile (SD-05). Every number is derived from the wallet's round rows (API-24 through
 * the same indexer-first read as History), so it never claims more than the chain shows.
 */
export default function ProfilePage() {
  const { address, isConnected } = useAccount()
  const history = useWalletHistory(address)
  const rows = history.data?.rows

  const stats = useMemo(() => {
    const list = rows ?? []
    const deposited = list.reduce((sum, row) => sum + row.deposited, 0n)
    const claimedEth = list.reduce((sum, row) => sum + row.claimedEth, 0n)
    const claimedPots = list.reduce((sum, row) => sum + row.claimedPots, 0n)
    const ids = list.map((row) => row.roundId)
    return {
      rounds: list.length,
      rewardRounds: list.filter((row) => row.claimedEth > 0n || row.claimedPots > 0n).length,
      deposited,
      claimedEth,
      claimedPots,
      net: netEth(claimedEth, deposited),
      firstRound: ids.length ? ids.reduce((min, id) => (id < min ? id : min)) : null,
      latestRound: ids.length ? ids.reduce((max, id) => (id > max ? id : max)) : null,
    }
  }, [rows])

  return (
    <section aria-labelledby="profile-title" className="flex flex-col gap-4">
      <div>
        <h1 id="profile-title" className="text-2xl font-bold">
          Profile
        </h1>
        <p className="mt-1 max-w-prose text-sm text-text-2">
          {address ? (
            <>
              Totals for <span className="font-mono">{shortenAddress(address)}</span>, derived from
              public chain data.
            </>
          ) : (
            'Totals for the connected wallet, derived from public chain data.'
          )}
        </p>
      </div>

      {!isConnected ? (
        <EmptyState
          title="Connect a wallet"
          description="Your profile appears after a wallet is connected."
        />
      ) : null}

      {isConnected && history.isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {isConnected && history.isError ? (
        <EmptyState
          title="The profile could not load"
          description="Neither the indexer nor the RPC returned this wallet's rounds. Try again in a moment."
        />
      ) : null}

      {isConnected && rows?.length === 0 ? (
        <EmptyState
          title="No deploys yet"
          description="Deploy on a round on the Mine page and your totals appear here."
        />
      ) : null}

      {isConnected && rows && rows.length > 0 ? (
        <div className="flex flex-col gap-3">
          <LeadStat label="Total deployed" value={`${formatWeiToEth(stats.deposited, 5)} ETH`} />
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Rounds played" value={stats.rounds.toString()} />
            <Stat label="Rounds with a claim" value={stats.rewardRounds.toString()} />
            <Stat label="ETH claimed" value={`${formatWeiToEth(stats.claimedEth, 5)} ETH`} />
            <Stat label="POTS claimed" value={`${formatWeiToEth(stats.claimedPots, 4)} POTS`} />
            <Stat
              label="ETH claimed minus deployed"
              value={`${formatWeiToEth(stats.net, 5)} ETH`}
            />
            <Stat label="First round" value={stats.firstRound ? `#${stats.firstRound}` : '-'} />
            <Stat label="Latest round" value={stats.latestRound ? `#${stats.latestRound}` : '-'} />
          </dl>
          <p className="text-xs text-text-2">
            ETH claimed minus deployed counts only rewards and refunds you have already claimed, so
            a recent win shows as negative until you claim it on the Mine page or in History. ETH
            claimed includes refunds from cancelled rounds.
          </p>
        </div>
      ) : null}

      {isConnected && history.data ? <DataSource source={history.data.source} /> : null}
      {isConnected && history.data?.truncated ? (
        <p className="text-xs text-text-2">
          Totals cover the latest {HISTORY_ROW_LIMIT} rounds. Older rounds stay on chain.
        </p>
      ) : null}
    </section>
  )
}
