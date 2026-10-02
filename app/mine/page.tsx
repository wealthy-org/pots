'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAccount, useConnect } from 'wagmi'
import { GridCellData } from '@/components/mine/grid-cell'
import { KeeperPanel } from '@/components/mine/keeper-panel'
import { ResultPanel } from '@/components/mine/result-panel'
import { ReviewModal } from '@/components/mine/review-modal'
import { SelectionPanel } from '@/components/mine/selection-panel'
import { SquareGrid } from '@/components/mine/square-grid'
import { StatsBar } from '@/components/mine/stats-bar'
import { WinnersPanel } from '@/components/mine/winners-panel'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Toast, ToastViewport } from '@/components/ui/toast'
import {
  useBalances,
  useClaimable,
  useCurrentRoundId,
  useEntryLimits,
  useRound,
  useSquareTotals,
  useWalletRound,
} from '@/hooks/use-round'
import { usePotsWrites } from '@/hooks/use-pots-writes'
import { PRESETS, type PresetName } from '@/lib/presets'
import { Phase } from '@/lib/types'
import type { WalletRoundData } from '@/lib/types'
import { multiplyWei, parseEthToWei } from '@/lib/wei'

export default function MinePage() {
  const { address, isConnected } = useAccount()
  const { connectors, connect } = useConnect()

  const current = useCurrentRoundId()
  const roundId = current.data as bigint | undefined
  const roundResult = useRound(roundId)
  const round = roundResult.round
  const totals = useSquareTotals(roundId)
  const balances = useBalances()
  const claimable = useClaimable(roundId, address)
  const walletRoundResult = useWalletRound(roundId, address)
  const limits = useEntryLimits()
  const writes = usePotsWrites()

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [activePreset, setActivePreset] = useState<PresetName | null>(null)
  const [amount, setAmount] = useState('0.001')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const totalsArray = totals.data as readonly bigint[] | undefined
  const cells: GridCellData[] = useMemo(
    () =>
      Array.from({ length: 25 }, (_, index) => ({
        id: index + 1,
        total: totalsArray?.[index] ?? null,
        miners: null,
        selected: selected.has(index + 1),
        scan: round?.phase === Phase.RANDOMNESS_PENDING,
        win: round?.phase === Phase.SETTLED && round.winningSquare === index + 1,
      })),
    [totalsArray, selected, round],
  )

  /* eslint-disable react-hooks/set-state-in-effect -- a confirmed transaction must close the review modal and clear the selection */
  useEffect(() => {
    if (writes.isConfirmed) {
      setReviewOpen(false)
      setSelected(new Set())
      setActivePreset(null)
      setToast('Entry confirmed')
      writes.reset()
    }
  }, [writes.isConfirmed, writes])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!toast) {
      return
    }
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const parsedAmount = parseEthToWei(amount)
  const totalWei =
    parsedAmount !== null && selected.size > 0 ? multiplyWei(parsedAmount, selected.size) : 0n

  const entryPhase =
    round?.phase === Phase.OPEN || round?.phase === Phase.WAITING || round === undefined

  function toggleSquare(square: number) {
    if (!entryPhase) {
      return
    }
    setActivePreset(null)
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(square)) {
        next.delete(square)
      } else {
        next.add(square)
      }
      return next
    })
  }

  function togglePreset(name: PresetName) {
    if (!entryPhase) {
      return
    }
    if (activePreset === name) {
      setActivePreset(null)
      setSelected(new Set())
      return
    }
    setActivePreset(name)
    setSelected(new Set(PRESETS[name]))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_446px] lg:items-start">
      <section aria-label="Mining grid">
        {current.isLoading ? <Skeleton className="h-16 w-full" /> : null}

        {current.isError ? (
          <EmptyState
            title="The chain read failed"
            description="The RPC did not answer. Retry the read."
            action={
              <Button size="sm" onClick={() => current.refetch()}>
                Retry
              </Button>
            }
          />
        ) : null}

        {roundId !== undefined && roundId > 0n ? (
          <>
            <StatsBar
              roundId={roundId}
              round={round}
              balances={balances.data as readonly [bigint, bigint, bigint] | undefined}
            />
            <div className="mt-4">
              {totals.isLoading ? (
                <Skeleton className="aspect-square w-full" />
              ) : (
                <SquareGrid cells={cells} onToggle={toggleSquare} disabled={!entryPhase} />
              )}
            </div>
            <WinnersPanel />
          </>
        ) : null}

        {roundId === 0n && !current.isLoading ? (
          <EmptyState
            title="Round 1 is waiting for the first entry"
            description="Start the round, then enter with ETH on one or more squares."
          />
        ) : null}
      </section>

      <aside className="flex flex-col gap-4" aria-label="Deploy panel">
        {roundResult.isError ? (
          <EmptyState
            title="Round data failed to load"
            description="Retry the contract read."
            action={
              <Button size="sm" onClick={() => roundResult.refetch()}>
                Retry
              </Button>
            }
          />
        ) : null}

        {roundId !== undefined ? (
          <SelectionPanel
            selected={selected}
            activePreset={activePreset}
            onTogglePreset={togglePreset}
            amount={amount}
            onAmountChange={setAmount}
            minWei={limits.minWei}
            maxWei={limits.maxWei}
            round={round}
            isConnected={isConnected}
            onConnect={() => {
              const connector = connectors[0]
              if (connector) {
                connect({ connector })
              }
            }}
            onReview={() => setReviewOpen(true)}
          />
        ) : null}

        <ResultPanel
          roundId={roundId}
          round={round}
          isConnected={isConnected}
          claimable={claimable.data as readonly [bigint, bigint] | undefined}
          walletRound={walletRoundResult.walletRound as WalletRoundData | undefined}
          onClaimEth={() => roundId !== undefined && writes.claimEth(roundId)}
          onClaimPots={() => roundId !== undefined && writes.claimPots(roundId)}
          isSubmitting={writes.isSubmitting || writes.isConfirming}
        />

        <KeeperPanel
          roundId={roundId}
          round={round}
          onLock={() => writes.lock()}
          onRequestRandomness={() => writes.requestRandomness()}
          onSettle={() => roundId !== undefined && writes.settle(roundId)}
          onRefund={() => roundId !== undefined && writes.refundRandomness(roundId)}
          onCancel={() => roundId !== undefined && writes.cancelRound(roundId)}
          onStartNextRound={() => writes.startNextRound()}
          isSubmitting={writes.isSubmitting || writes.isConfirming}
        />

        {writes.errorMessage ? (
          <p role="alert" className="text-xs text-loss">
            {writes.errorMessage}
          </p>
        ) : null}
      </aside>

      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onConfirm={() => writes.enter(Array.from(selected), parsedAmount ?? 0n)}
        roundId={roundId}
        closeAt={round?.closeAt}
        squares={Array.from(selected)}
        amountPerSquare={parsedAmount ?? 0n}
        totalWei={totalWei}
        isSubmitting={writes.isSubmitting || writes.isConfirming}
        errorMessage={writes.errorMessage}
      />

      {toast ? (
        <ToastViewport>
          <Toast title={toast} description={writes.hash} />
        </ToastViewport>
      ) : null}
    </div>
  )
}
