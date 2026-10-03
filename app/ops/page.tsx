'use client'

import Link from 'next/link'
import { KeeperPanel } from '@/components/mine/keeper-panel'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { usePotsWrites } from '@/hooks/use-pots-writes'
import { useEscapeAt } from '@/hooks/use-escape-at'
import { useCurrentRoundId, useRound } from '@/hooks/use-round'
import { phaseLabel } from '@/lib/types'

/**
 * Operator fallbacks (ADR-014). Not linked from any navigation: the keeper normally advances the
 * round, and the deploy flow starts the next one. Every action here is permissionless.
 */
export default function OpsPage() {
  const current = useCurrentRoundId()
  const roundId = current.data as bigint | undefined
  const { round, isError: roundError, isLoading: roundLoading } = useRound(roundId)
  const escapeAt = useEscapeAt(roundId, round)
  const writes = usePotsWrites()

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-bold">Operator fallbacks</h1>
      <p className="text-sm text-text-2">
        Anyone can use these. The keeper normally runs lock, randomness, and settlement, and the
        deploy flow starts the next round. Use this page only when the keeper is not running.
      </p>

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

      {roundId === 0n ? (
        <EmptyState
          title="No round yet"
          description="The first round starts with the first deploy on the Mine page."
        />
      ) : null}
      {roundId !== undefined && roundId > 0n && roundLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : null}
      {roundError ? (
        <EmptyState
          title="Round data failed to load"
          description="Reload the page to retry the read."
        />
      ) : null}

      {roundId !== undefined && roundId > 0n && round ? (
        <>
          <p role="status" aria-live="polite" className="font-mono text-sm">
            Round {roundId.toString()}: {phaseLabel(round.phase)}
          </p>
          <KeeperPanel
            roundId={roundId}
            round={round}
            escapeAt={escapeAt}
            onLock={() => writes.lock()}
            onRequestRandomness={() => writes.requestRandomness()}
            onSettle={() => writes.settle(roundId)}
            onRefund={() => writes.refundRandomness(roundId)}
            onCancel={() => writes.cancelRound(roundId)}
            isSubmitting={writes.isSubmitting || writes.isConfirming}
          />
          <p className="text-xs text-text-3">
            If no button is shown, no operator action is available for this phase.
          </p>
        </>
      ) : null}

      {writes.errorMessage ? (
        <p role="alert" className="text-xs text-loss">
          {writes.errorMessage}
        </p>
      ) : null}

      <Link
        href="/mine"
        className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
      >
        Back to Mine
      </Link>
    </div>
  )
}
