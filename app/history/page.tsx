'use client'

import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { DataSource } from '@/components/ui/data-source'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useWalletHistory } from '@/hooks/use-wallet-history'
import { HISTORY_ROW_LIMIT } from '@/lib/indexer'
import { formatWeiToEth } from '@/lib/wei'
import { netEth } from '@/lib/shares'

export default function HistoryPage() {
  const { address, isConnected } = useAccount()
  const history = useWalletHistory(address)
  const rows = history.data?.rows

  const net = useMemo(
    () => (rows ?? []).reduce((sum, row) => sum + netEth(row.claimedEth, row.deposited), 0n),
    [rows],
  )

  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-4">
      <div>
        <h1 id="history-title" className="text-2xl font-bold">
          History
        </h1>
        <p className="mt-1 max-w-prose text-sm text-text-2">
          Rounds and outcomes for the connected wallet. Each view names its source and the block it
          reflects.
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
          title="History could not load"
          description="Neither the indexer nor the RPC returned this wallet's history. Try again in a moment."
        />
      ) : null}

      {isConnected && rows?.length === 0 ? (
        <EmptyState
          title="No entries yet"
          description="Enter a round on the Mine page and it will appear here."
        />
      ) : null}

      {isConnected && rows && rows.length > 0 ? (
        <Panel className="p-0">
          <div className="grid grid-cols-[70px_1fr_1fr_1fr_90px] gap-2 border-b border-line px-3 py-2 text-[10px] font-semibold tracking-[0.12em] text-text-3 uppercase">
            <span>Round</span>
            <span className="text-right">Deposited</span>
            <span className="text-right">Claimed ETH</span>
            <span className="text-right">Claimed POTS</span>
            <span className="text-right">Net ETH</span>
          </div>
          {rows.map((row) => {
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

      {isConnected && history.data ? <DataSource source={history.data.source} /> : null}
      {isConnected && history.data?.truncated ? (
        <p className="text-xs text-text-2">
          Showing the latest {HISTORY_ROW_LIMIT} rounds. Older rounds stay on chain.
        </p>
      ) : null}
    </section>
  )
}
