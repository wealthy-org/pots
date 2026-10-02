'use client'

import { Button } from '@/components/ui/button'
import { Phase, ZERO_BYTES32, type RoundData, type WalletRoundData } from '@/lib/types'
import { formatWeiToEth } from '@/lib/wei'

export function ResultPanel({
  roundId,
  round,
  isConnected,
  claimable,
  walletRound,
  onClaimEth,
  onClaimPots,
  isSubmitting,
}: {
  roundId?: bigint
  round?: RoundData
  isConnected: boolean
  claimable?: readonly [bigint, bigint]
  walletRound?: WalletRoundData
  onClaimEth: () => void
  onClaimPots: () => void
  isSubmitting: boolean
}) {
  if (!round || roundId === undefined || roundId === 0n) {
    return null
  }

  if (round.phase === Phase.RANDOMNESS_PENDING) {
    return (
      <section className="rounded-md border border-line bg-bg-elev p-3">
        <h2 className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">
          Randomness pending
        </h2>
        <p className="mt-1.5 text-xs text-text-2">
          The round is locked and waiting for the verified draw. Anyone can settle once the output
          is stored.
        </p>
        {round.randomOutput !== ZERO_BYTES32 ? (
          <p className="mt-2 font-mono text-[10px] break-all text-text-3">
            output {round.randomOutput}
          </p>
        ) : null}
      </section>
    )
  }

  if (round.phase === Phase.SETTLED) {
    const eth = claimable?.[0] ?? 0n
    const pots = claimable?.[1] ?? 0n
    return (
      <section className="rounded-md border border-line bg-bg-elev p-3">
        <h2 className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">
          Result
        </h2>
        <p className="mt-1.5 text-sm">
          Winning square <span className="font-mono text-gold">#{round.winningSquare}</span>
          {round.jackpotHit ? <span className="text-gold"> · Jackpot hit</span> : null}
        </p>
        {isConnected ? (
          <div className="mt-2.5 flex flex-col gap-2">
            {eth > 0n ? (
              <Button size="sm" onClick={onClaimEth} disabled={isSubmitting}>
                Claim {formatWeiToEth(eth, 5)} ETH
              </Button>
            ) : null}
            {pots > 0n ? (
              <Button size="sm" variant="secondary" onClick={onClaimPots} disabled={isSubmitting}>
                Claim {formatWeiToEth(pots, 4)} POTS
              </Button>
            ) : null}
            {eth === 0n && pots === 0n ? (
              <p className="text-xs text-text-2">
                No claimable reward for this wallet in this round.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-text-2">
            Connect a wallet to see and claim entitlements.
          </p>
        )}
      </section>
    )
  }

  if (round.phase === Phase.CANCELLED) {
    const refund = claimable?.[0] ?? 0n
    return (
      <section className="rounded-md border border-line bg-bg-elev p-3">
        <h2 className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">
          Round cancelled
        </h2>
        <p className="mt-1.5 text-xs text-text-2">
          Randomness failed. Entries are refunded in full with no fee.
        </p>
        {isConnected && refund > 0n ? (
          <Button size="sm" className="mt-2.5" onClick={onClaimEth} disabled={isSubmitting}>
            Claim refund {formatWeiToEth(refund, 5)} ETH
          </Button>
        ) : null}
      </section>
    )
  }

  if (isConnected && walletRound && walletRound.deposited > 0n) {
    return (
      <p className="rounded-md border border-line bg-bg-elev px-3 py-2.5 text-xs text-text-2">
        Your entry this round: {formatWeiToEth(walletRound.deposited, 5)} ETH
        {walletRound.ethClaimed || walletRound.potsClaimed ? ' · some rewards already claimed' : ''}
      </p>
    )
  }

  return null
}
