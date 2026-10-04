'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import type { GridCellData } from '@/components/mine/grid-cell'
import { PanelStats } from '@/components/mine/panel-stats'
import { ResultPanel } from '@/components/mine/result-panel'
import { PlanReviewModal } from '@/components/mine/plan-panel'
import { ReviewModal } from '@/components/mine/review-modal'
import { SelectionPanel, type MineTab } from '@/components/mine/selection-panel'
import { SquareGrid } from '@/components/mine/square-grid'
import { WinnersPanel, type WinnerClaimState } from '@/components/mine/winners-panel'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Toast, ToastViewport } from '@/components/ui/toast'
import { useClaimableRounds } from '@/hooks/use-claimable-rounds'
import { useEscapeAt } from '@/hooks/use-escape-at'
import { useMyEntries } from '@/hooks/use-my-entries'
import { useWalletConnect } from '@/hooks/use-wallet-connect'
import { useWalletHistory } from '@/hooks/use-wallet-history'
import { usePotsWrites } from '@/hooks/use-pots-writes'
import {
  useBalances,
  useClaimable,
  useCurrentRoundId,
  useEntryLimits,
  usePaused,
  useRound,
  useRoundWindow,
  useSquareTotals,
  useWalletRound,
} from '@/hooks/use-round'
import { useLastJackpotRound } from '@/hooks/use-last-jackpot'
import { usePlan } from '@/hooks/use-plan'
import { useReferral } from '@/hooks/use-referral'
import { usePlanWrites } from '@/hooks/use-plan-writes'
import { useReached } from '@/hooks/use-reached'
import { useRoundMiners } from '@/hooks/use-round-miners'
import { canEnterPhase } from '@/lib/entry-phase'
import { PRESETS, type PresetName } from '@/lib/presets'
import { planBlockReason, planDeposit } from '@/lib/plan-math'
import { Phase, phaseLabel } from '@/lib/types'
import type { WalletRoundData } from '@/lib/types'
import { formatWeiToEth, multiplyWei, parseEthToWei } from '@/lib/wei'

const KEEPER_GRACE_SECONDS = 90n

export default function MinePage() {
  const { address, isConnected } = useAccount()
  const wallet = useWalletConnect()

  const current = useCurrentRoundId()
  const roundId = current.data as bigint | undefined
  const roundResult = useRound(roundId)
  const round = roundResult.round
  const totals = useSquareTotals(roundId)
  const balances = useBalances()
  const claimable = useClaimable(roundId, address)
  const walletRoundResult = useWalletRound(roundId, address)
  const limits = useEntryLimits()
  const windowSeconds = useRoundWindow()
  const roundMiners = useRoundMiners(roundId)
  const myEntries = useMyEntries(roundId, address)
  const lastJackpot = useLastJackpotRound()
  const escapeAt = useEscapeAt(roundId, round)
  const stalled = useReached(escapeAt)
  const deadlinePassed = useReached(round?.closeAt)
  // About 90 s past the deadline the keeper has missed a run; the operator page can lock the round.
  const keeperLate = useReached(
    round?.phase === Phase.OPEN && round.closeAt > 0n
      ? round.closeAt + KEEPER_GRACE_SECONDS
      : undefined,
  )
  // Open, the countdown ended, and the keeper has not locked the round yet (L-113).
  const roundClosed = round?.phase === Phase.OPEN && deadlinePassed
  const pastClaims = useClaimableRounds(address)
  const history = useWalletHistory(address)
  const paused = usePaused().data === true
  const writes = usePotsWrites()
  const phaseAnnouncement =
    roundId !== undefined && roundId > 0n && round
      ? `Round ${roundId.toString()}: ${phaseLabel(round.phase)}`
      : ''

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [activePreset, setActivePreset] = useState<PresetName | null>(null)
  const [tab, setTab] = useState<MineTab>('auto')
  const [amount, setAmount] = useState('0.001')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [toastHash, setToastHash] = useState<string | undefined>()
  const [lastAction, setLastAction] = useState<'entry' | 'claim'>('entry')
  const [planRounds, setPlanRounds] = useState(5)
  const [planLoop, setPlanLoop] = useState(false)
  const [planReviewOpen, setPlanReviewOpen] = useState(false)
  const [lastPlanAction, setLastPlanAction] = useState<'start' | 'stop' | 'loop'>('start')
  const planState = usePlan(address)
  const referral = useReferral(address)
  const planWrites = usePlanWrites()

  const totalsArray = totals.data as readonly bigint[] | undefined
  const busiest = totalsArray?.reduce((max, value) => (value > max ? value : max), 0n) ?? 0n
  const minerData = roundMiners.data
  const cells: GridCellData[] = useMemo(
    () =>
      Array.from({ length: 25 }, (_, index) => {
        const total = totalsArray?.[index] ?? null
        const indexed = minerData?.perBlock[index]
        // An indexed count is shown only while its ETH total equals the contract's (no stale count).
        const miners =
          total !== null && indexed ? (indexed.total === total ? indexed.miners : null) : null
        return {
          id: index + 1,
          total,
          miners: total === 0n ? 0 : miners,
          selected: selected.has(index + 1),
          heat: busiest > 0n && total !== null ? Number((total * 1000n) / busiest) / 1000 : 0,
          you: myEntries.entries[index],
          win: round?.phase === Phase.SETTLED && round.winningSquare === index + 1,
        }
      }),
    [totalsArray, selected, round, minerData, busiest, myEntries.entries],
  )
  const minersInRound =
    minerData?.miners != null &&
    totalsArray?.every((total, index) => {
      const indexed = minerData.perBlock[index]
      return total === 0n || (indexed !== null && indexed?.total === total)
    })
      ? minerData.miners
      : null

  /* eslint-disable react-hooks/set-state-in-effect -- a confirmed transaction must close the review modal and clear the selection */
  const { isConfirmed, hash: confirmedHash, reset: resetWrites } = writes
  useEffect(() => {
    if (isConfirmed) {
      setToastHash(confirmedHash)
      void myEntries.refetch()
      void pastClaims.refetch()
      void claimable.refetch()
      void walletRoundResult.refetch()
      if (lastAction === 'entry') {
        setReviewOpen(false)
        setSelected(new Set())
        setActivePreset(null)
        setToast('Deployed')
      } else {
        setToast('Claim confirmed')
      }
      resetWrites()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the refetch functions are stable per query
  }, [isConfirmed, confirmedHash, resetWrites, lastAction])
  /* eslint-enable react-hooks/set-state-in-effect */

  const { isConfirmed: planConfirmed, hash: planHash, reset: resetPlanWrites } = planWrites
  const { refetch: refetchPlan } = planState
  /* eslint-disable react-hooks/set-state-in-effect -- a confirmed plan transaction closes the review modal and refreshes the plan */
  useEffect(() => {
    if (planConfirmed) {
      setToastHash(planHash)
      void refetchPlan()
      setPlanReviewOpen(false)
      if (lastPlanAction === 'start') {
        setSelected(new Set())
        setActivePreset(null)
        setToast('Auto plan started')
      } else if (lastPlanAction === 'stop') {
        setToast('Auto plan stopped')
      } else {
        setToast('Loop updated')
      }
      resetPlanWrites()
    }
  }, [planConfirmed, planHash, refetchPlan, resetPlanWrites, lastPlanAction])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!toast) {
      return
    }
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const parsedAmount = parseEthToWei(amount)
  const selectedBlocks = useMemo(() => Array.from(selected).sort((a, b) => a - b), [selected])
  const planBlock = planBlockReason({
    rounds: planRounds,
    squares: selected.size,
    amountPerSquare: parsedAmount,
    minAmount: limits.minWei,
    maxAmount: limits.maxWei,
    minDeposit: planState.minDeposit,
    paused,
    planExists: Boolean(planState.plan && (planState.plan.active || planState.plan.balance > 0n)),
    capReached:
      planState.activeCount !== undefined &&
      planState.maxActive !== undefined &&
      planState.activeCount >= planState.maxActive,
    registered: planState.registered,
  })
  const planDepositWei =
    parsedAmount !== null && selected.size > 0
      ? planDeposit(planRounds, selected.size, parsedAmount)
      : 0n
  const totalWei =
    parsedAmount !== null && selected.size > 0 ? multiplyWei(parsedAmount, selected.size) : 0n

  // A finished round, or no round yet, means the next round starts with this deploy (ADR-014).
  const needsStart =
    roundId !== undefined &&
    (roundId === 0n || round?.phase === Phase.SETTLED || round?.phase === Phase.CANCELLED)
  const entryRoundId = needsStart && roundId !== undefined ? roundId + 1n : roundId
  const claimableData = claimable.data as readonly [bigint, bigint] | undefined
  const claimEthWei = claimableData?.[0] ?? 0n
  const claimPotsWei = claimableData?.[1] ?? 0n
  const claimRound = round?.phase === Phase.SETTLED || round?.phase === Phase.CANCELLED
  const claims: Array<{ label: string; onClick: () => void; disabled: boolean }> = []
  if (isConnected && claimRound && roundId !== undefined) {
    const busy = writes.isSubmitting || writes.isConfirming
    if (claimEthWei > 0n) {
      claims.push({
        label: `Claim ${round?.phase === Phase.CANCELLED ? 'refund ' : ''}${formatWeiToEth(claimEthWei, 5)} ETH`,
        onClick: () => {
          setLastAction('claim')
          writes.claimEth(roundId)
        },
        disabled: busy,
      })
    }
    if (claimPotsWei > 0n) {
      claims.push({
        label: `Claim ${formatWeiToEth(claimPotsWei, 4)} POTS`,
        onClick: () => {
          setLastAction('claim')
          writes.claimPots(roundId)
        },
        disabled: busy,
      })
    }
  }
  const earlier: typeof claims = []
  // A reward stays claimable after the keeper has started later rounds, so earlier rounds of the
  // wallet get their own claim buttons (the oldest first, then the current round, at most three buttons in all).
  if (isConnected) {
    const busy = writes.isSubmitting || writes.isConfirming
    for (const past of pastClaims.rounds) {
      if (past.roundId === roundId) {
        continue
      }
      if (past.eth > 0n) {
        earlier.push({
          label: `Claim ${formatWeiToEth(past.eth, 5)} ETH (round #${past.roundId})`,
          onClick: () => {
            setLastAction('claim')
            writes.claimEth(past.roundId)
          },
          disabled: busy,
        })
      }
      if (past.pots > 0n) {
        earlier.push({
          label: `Claim ${formatWeiToEth(past.pots, 4)} POTS (round #${past.roundId})`,
          onClick: () => {
            setLastAction('claim')
            writes.claimPots(past.roundId)
          },
          disabled: busy,
        })
      }
    }
  }
  const visibleClaims = [...earlier, ...claims].slice(0, 3)
  // The YOU row follows the round shown in the winners list, which is often an earlier round.
  function claimStateFor(id: bigint): WinnerClaimState | null {
    if (pastClaims.rounds.some((past) => past.roundId === id)) {
      return 'ready'
    }
    if (id === roundId && round?.phase === Phase.SETTLED) {
      if (claimEthWei > 0n || claimPotsWei > 0n) {
        return 'ready'
      }
      return walletRoundResult.walletRound?.ethClaimed ? 'claimed' : null
    }
    return (history.data?.rows ?? []).some((row) => row.roundId === id && row.claimedEth > 0n)
      ? 'claimed'
      : null
  }
  const entryPhase = canEnterPhase(round?.phase, needsStart, roundClosed)

  function toggleBlock(block: number) {
    if (!entryPhase) {
      return
    }
    setActivePreset(null)
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(block)) {
        next.delete(block)
      } else {
        next.add(block)
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

  function selectAll() {
    if (!entryPhase) {
      return
    }
    setActivePreset(null)
    setSelected((previous) =>
      previous.size === 25 ? new Set() : new Set(Array.from({ length: 25 }, (_, i) => i + 1)),
    )
  }

  function removeLast() {
    setActivePreset(null)
    setSelected((previous) => {
      const next = new Set(previous)
      const last = Array.from(previous).pop()
      if (last !== undefined) {
        next.delete(last)
      }
      return next
    })
  }

  function addRandom() {
    if (!entryPhase) {
      return
    }
    setActivePreset(null)
    setSelected((previous) => {
      const free = Array.from({ length: 25 }, (_, i) => i + 1).filter((id) => !previous.has(id))
      if (free.length === 0) {
        return previous
      }
      const next = new Set(previous)
      next.add(free[Math.floor(Math.random() * free.length)])
      return next
    })
  }

  const gridBlock =
    totals.isLoading && roundId !== 0n ? (
      <Skeleton className="aspect-square w-full" />
    ) : (
      <SquareGrid
        cells={cells}
        onToggle={toggleBlock}
        disabled={!entryPhase}
        scanning={round?.phase === Phase.RANDOMNESS_PENDING}
      />
    )

  return (
    <div className="mine-layout">
      <div className="mine-stats">
        <PanelStats
          roundId={roundId}
          round={round}
          jackpotWei={(balances.data as readonly [bigint, bigint, bigint] | undefined)?.[1]}
          miners={minersInRound}
          roundsAgo={
            lastJackpot.data && roundId !== undefined && roundId >= lastJackpot.data
              ? Number(roundId - lastJackpot.data)
              : null
          }
          windowSeconds={windowSeconds}
        />
      </div>
      <section aria-label="Mining grid" className="mine-grid">
        <h1 className="sr-only">Mine</h1>
        <p role="status" aria-live="polite" className="sr-only">
          {phaseAnnouncement}
        </p>
        {current.isLoading ? <Skeleton className="h-16 w-full" /> : null}

        {paused ? (
          <p
            role="status"
            className="mb-3 rounded-md border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm"
          >
            New deploys are paused. Claims, refunds, and settlement stay available.
          </p>
        ) : null}

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

        {roundClosed && keeperLate && !stalled ? (
          <p
            role="status"
            className="mb-3 rounded-md border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm"
          >
            The deadline passed and the keeper has not locked this round yet.{' '}
            <Link
              href="/ops"
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              Open the operator page
            </Link>
          </p>
        ) : null}

        {stalled ? (
          <p
            role="status"
            className="mb-3 rounded-md border border-loss/40 bg-loss/10 px-4 py-2.5 text-sm"
          >
            This round is stalled. Anyone can cancel it and refund every deploy.{' '}
            <Link
              href="/ops"
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              Open the operator page
            </Link>
          </p>
        ) : null}

        {roundId === 0n && !current.isLoading ? (
          <EmptyState
            title="Round 1 starts with the first deploy"
            description="Select blocks, enter an amount, and the round starts with your deploy."
          />
        ) : null}

        {roundId !== undefined && (roundId > 0n || !current.isLoading) ? (
          <div className={roundId === 0n ? 'mt-4' : ''}>{gridBlock}</div>
        ) : null}
      </section>
      <aside className="mine-panel flex flex-col gap-4" aria-label="Deploy panel">
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
            tab={tab}
            onTabChange={setTab}
            onSelectAll={selectAll}
            onRemoveLast={removeLast}
            onAddRandom={addRandom}
            amount={amount}
            onAmountChange={setAmount}
            minWei={limits.minWei}
            maxWei={limits.maxWei}
            round={round}
            isConnected={isConnected}
            paused={paused}
            needsStart={needsStart}
            roundClosed={roundClosed}
            walletAvailable={wallet.available}
            connectError={wallet.message}
            autoPlan={
              planState.enabled
                ? {
                    rounds: planRounds,
                    onRoundsChange: setPlanRounds,
                    loop: planLoop,
                    onLoopChange: setPlanLoop,
                    plan: planState.plan,
                    deposit: planDepositWei,
                    minDeposit: planState.minDeposit,
                    blockReason: planBlock,
                    busy: planWrites.isSubmitting || planWrites.isConfirming,
                    onStart: () => {
                      planWrites.reset()
                      setPlanReviewOpen(true)
                    },
                    onStop: () => {
                      setLastPlanAction('stop')
                      void planWrites.cancelPlan()
                    },
                    onToggleLoop: (next) => {
                      setLastPlanAction('loop')
                      void planWrites.setLoop(next, planState.consent)
                    },
                  }
                : undefined
            }
            claims={visibleClaims}
            onConnect={wallet.connect}
            onReview={() => setReviewOpen(true)}
          />
        ) : null}

        <ResultPanel
          roundId={roundId}
          round={round}
          isConnected={isConnected}
          claimable={claimableData}
          walletRound={walletRoundResult.walletRound as WalletRoundData | undefined}
        />

        {planWrites.errorMessage && !planReviewOpen ? (
          <p role="alert" className="text-xs text-loss">
            {planWrites.errorMessage}
          </p>
        ) : null}

        {writes.errorMessage ? (
          <p role="alert" className="text-xs text-loss">
            {writes.errorMessage}
          </p>
        ) : null}
      </aside>
      <div className="mine-winners">
        {roundId !== undefined && roundId > 0n ? (
          <WinnersPanel wallet={address} claimStateFor={claimStateFor} />
        ) : null}
      </div>

      <PlanReviewModal
        open={planReviewOpen}
        onClose={() => setPlanReviewOpen(false)}
        onConfirm={() => {
          setLastPlanAction('start')
          void planWrites.createPlan({
            squares: selectedBlocks,
            amountPerSquare: parsedAmount ?? 0n,
            rounds: planRounds,
            loop: planLoop,
            hasConsent: planState.consent,
          })
        }}
        squares={selectedBlocks}
        amountPerSquare={parsedAmount ?? 0n}
        rounds={planRounds}
        loop={planLoop}
        needsConsent={planState.consent !== true}
        deposit={planDepositWei}
        minDeposit={planState.minDeposit}
        isSubmitting={planWrites.isSubmitting || planWrites.isConfirming}
        errorMessage={planWrites.errorMessage}
      />

      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onConfirm={() => {
          setLastAction('entry')
          writes.enterAndStart(Array.from(selected), parsedAmount ?? 0n, referral.pendingRef)
        }}
        roundId={entryRoundId}
        needsStart={needsStart}
        closeAt={needsStart ? undefined : round?.closeAt}
        squares={Array.from(selected)}
        amountPerSquare={parsedAmount ?? 0n}
        totalWei={totalWei}
        referrer={referral.pendingRef}
        isSubmitting={writes.isSubmitting || writes.isConfirming}
        errorMessage={writes.errorMessage}
      />

      <ToastViewport>
        {toast ? <Toast title={toast} description={toastHash} /> : null}
      </ToastViewport>
    </div>
  )
}
