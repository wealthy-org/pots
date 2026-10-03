'use client'

import { useEffect, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { DataSource } from '@/components/ui/data-source'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useClaimableRounds } from '@/hooks/use-claimable-rounds'
import { usePotsWrites } from '@/hooks/use-pots-writes'
import { useWalletHistory } from '@/hooks/use-wallet-history'
import { HISTORY_ROW_LIMIT } from '@/lib/indexer'
import { netEth } from '@/lib/shares'
import { formatWeiToEth } from '@/lib/wei'

const CLAIM_SCAN_LIMIT = 40

/** One value of a history row: labelled on narrow screens, a plain column from `sm` up. */
function Cell({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col sm:block sm:text-right">
      <span className="text-[11px] tracking-[0.16em] text-text-3 uppercase sm:sr-only">
        {label}
      </span>
      <span className="text-text-2">{value}</span>
    </span>
  )
}

export default function HistoryPage() {
  const { address, isConnected } = useAccount()
  const history = useWalletHistory(address)
  const claimable = useClaimableRounds(address, CLAIM_SCAN_LIMIT)
  const writes = usePotsWrites()
  const rows = history.data?.rows

  const net = useMemo(
    () => (rows ?? []).reduce((sum, row) => sum + netEth(row.claimedEth, row.deposited), 0n),
    [rows],
  )
  const claimableById = useMemo(
    () => new Map(claimable.rounds.map((round) => [round.roundId.toString(), round])),
    [claimable.rounds],
  )

  const { isConfirmed } = writes
  const { refetch } = claimable
  const { refetch: refetchHistory } = history
  useEffect(() => {
    if (isConfirmed) {
      void refetch()
      void refetchHistory()
    }
  }, [isConfirmed, refetch, refetchHistory])

  // Only the oldest claim is the primary action on the page; the rest are secondary.
  const firstClaimRound = useMemo(() => {
    const ready = (rows ?? []).filter((row) => claimableById.get(row.roundId.toString())?.eth)
    return ready.length > 0 ? ready[ready.length - 1]!.roundId : undefined
  }, [rows, claimableById])

  const busy = writes.isSubmitting || writes.isConfirming

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
          title="No deploys yet"
          description="Deploy on a round on the Mine page and it will appear here."
        />
      ) : null}

      {isConnected && rows && rows.length > 0 ? (
        <Panel className="p-0">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[110px_1fr_1fr_1fr_1fr] gap-2 border-b border-line px-3 py-2 text-[11px] font-semibold tracking-[0.16em] text-text-3 uppercase sm:grid"
          >
            <span>Round</span>
            <span className="text-right">Deployed</span>
            <span className="text-right">Claimed ETH</span>
            <span className="text-right">Claimed POTS</span>
            <span className="text-right">Claimed minus deployed</span>
          </div>
          <ul>
            {rows.map((row) => {
              const rowNet = netEth(row.claimedEth, row.deposited)
              const pending = claimableById.get(row.roundId.toString())
              const primary = row.roundId === firstClaimRound
              return (
                <li key={row.roundId.toString()} className="border-b border-white/5">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2.5 font-mono text-xs sm:grid-cols-[110px_1fr_1fr_1fr_1fr] sm:items-center sm:gap-2 sm:py-2">
                    <span className="col-span-2 text-text sm:col-span-1 sm:text-text-2">
                      #{row.roundId.toString()}
                      {row.winningSquare ? ` · block ${row.winningSquare}` : ''}
                    </span>
                    <Cell label="Deployed" value={formatWeiToEth(row.deposited, 4)} />
                    <Cell label="Claimed ETH" value={formatWeiToEth(row.claimedEth, 4)} />
                    <Cell label="Claimed POTS" value={formatWeiToEth(row.claimedPots, 3)} />
                    <Cell label="Claimed minus deployed" value={formatWeiToEth(rowNet, 4)} />
                  </div>
                  {pending ? (
                    <div className="flex flex-wrap items-center gap-2 px-3 pb-2.5">
                      <span className="text-xs text-text-2">Ready to claim:</span>
                      {pending.eth > 0n ? (
                        <Button
                          size="sm"
                          variant={primary ? 'primary' : 'secondary'}
                          disabled={busy}
                          onClick={() => writes.claimEth(row.roundId)}
                        >
                          Claim {formatWeiToEth(pending.eth, 5)} ETH
                        </Button>
                      ) : null}
                      {pending.pots > 0n ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => writes.claimPots(row.roundId)}
                        >
                          Claim {formatWeiToEth(pending.pots, 4)} POTS
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <div className="flex justify-between gap-3 px-3 py-2 text-xs text-text-2">
            <span>Claimed minus deployed across rounds</span>
            <span className="font-mono text-text">{formatWeiToEth(net, 4)} ETH</span>
          </div>
        </Panel>
      ) : null}

      <p role="status" className="text-xs text-text-2">
        {writes.isSubmitting
          ? 'Confirm the claim in your wallet.'
          : writes.isConfirming
            ? 'Claim sent. Waiting for confirmation.'
            : writes.isConfirmed
              ? 'Claim confirmed. The list is refreshing.'
              : ''}
      </p>
      {writes.errorMessage ? (
        <p role="alert" className="text-xs text-loss">
          {writes.errorMessage}
        </p>
      ) : null}

      {isConnected && history.data ? <DataSource source={history.data.source} /> : null}
      {isConnected && history.data?.truncated ? (
        <p className="text-xs text-text-2">
          Showing the latest {HISTORY_ROW_LIMIT} rounds. Older rounds stay on chain.
        </p>
      ) : null}
      {isConnected && rows && rows.length > CLAIM_SCAN_LIMIT ? (
        <p className="text-xs text-text-2">
          Claim buttons cover the latest {CLAIM_SCAN_LIMIT} rounds. Older rewards stay claimable on
          the contract.
        </p>
      ) : null}
    </section>
  )
}
