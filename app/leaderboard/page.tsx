'use client'

import { useAccount } from 'wagmi'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useLeaderboard } from '@/hooks/use-leaderboard'
import { shortenAddress } from '@/lib/format'
import { indexerEnabled, LEADERBOARD_LIMIT } from '@/lib/indexer'
import { formatWeiToEth } from '@/lib/wei'

/**
 * All-time ranking by POTS mined (claimed round rewards). It is not a ranking of ETH won or lost.
 * Every row comes from the indexer and is derived from public on-chain events.
 */
export default function LeaderboardPage() {
  const { address } = useAccount()
  const board = useLeaderboard()
  const rows = board.data?.rows

  return (
    <section aria-labelledby="leaderboard-title" className="flex flex-col gap-4">
      <div>
        <h1 id="leaderboard-title" className="text-2xl font-bold">
          Leaderboard
        </h1>
        <p className="mt-1 max-w-prose text-sm text-text-2">
          Wallets ranked by POTS mined, all time. Only POTS claimed from round rewards counts;
          referral bonuses are not ranked. Wallet addresses are public on chain.
        </p>
      </div>

      {!indexerEnabled ? (
        <EmptyState
          title="The leaderboard needs the indexer"
          description="It is built from indexed events and is not shown when only the contract is read."
        />
      ) : board.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : board.isError ? (
        <Panel>
          <p role="alert" className="text-sm text-text-2">
            The indexer did not return the ranking. Try again in a moment.
          </p>
        </Panel>
      ) : rows && rows.length === 0 ? (
        <EmptyState
          title="No POTS mined yet"
          description="A wallet appears here after it claims POTS from a round."
        />
      ) : rows ? (
        <Panel className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <caption className="sr-only">
                Top {LEADERBOARD_LIMIT} wallets by POTS mined, all time
              </caption>
              <thead>
                <tr className="border-b border-line text-[11px] tracking-[0.16em] text-text-3 uppercase">
                  <th scope="col" className="px-2 py-3 sm:px-3 font-semibold">
                    #
                  </th>
                  <th scope="col" className="px-2 py-3 sm:px-3 font-semibold">
                    Wallet
                  </th>
                  <th scope="col" className="px-2 py-3 sm:px-3 text-right font-semibold">
                    POTS mined
                  </th>
                  <th scope="col" className="px-2 py-3 sm:px-3 text-right font-semibold">
                    Rounds
                  </th>
                  <th
                    scope="col"
                    className="hidden px-2 py-3 sm:px-3 text-right font-semibold sm:table-cell"
                  >
                    ETH deployed
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const mine = address !== undefined && row.wallet === address.toLowerCase()
                  return (
                    <tr
                      key={row.wallet}
                      aria-current={mine ? 'true' : undefined}
                      className={`border-b border-line last:border-b-0 ${mine ? 'bg-gold/10' : ''}`}
                    >
                      <td className="px-2 py-3 sm:px-3 font-mono text-text-2">{index + 1}</td>
                      <td className="px-2 py-3 sm:px-3 font-mono">
                        {shortenAddress(row.wallet)}
                        {mine ? <span className="ml-2 text-xs text-gold">You</span> : null}
                      </td>
                      <td className="px-2 py-3 sm:px-3 text-right font-mono">
                        {formatWeiToEth(row.potsClaimed, 4)}
                      </td>
                      <td className="px-2 py-3 sm:px-3 text-right font-mono">{row.roundsPlayed}</td>
                      <td className="hidden px-2 py-3 sm:px-3 text-right font-mono sm:table-cell">
                        {formatWeiToEth(row.ethDeployed, 4)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {board.data ? (
        <p className="font-mono text-xs text-text-2">
          Source: indexer, last indexed block {board.data.lastIndexedBlock.toString()}
        </p>
      ) : null}
    </section>
  )
}
