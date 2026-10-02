'use client'

import { Button } from '@/components/ui/button'
import { Phase, ZERO_BYTES32, type RoundData } from '@/lib/types'

export function KeeperPanel({
  roundId,
  round,
  onLock,
  onRequestRandomness,
  onSettle,
  onRefund,
  onCancel,
  onStartNextRound,
  isSubmitting,
}: {
  roundId?: bigint
  round?: RoundData
  onLock: () => void
  onRequestRandomness: () => void
  onSettle: () => void
  onRefund: () => void
  onCancel: () => void
  onStartNextRound: () => void
  isSubmitting: boolean
}) {
  if (roundId === undefined) {
    return null
  }

  const buttons: Array<{ label: string; action: () => void }> = []

  if (!round || roundId === 0n) {
    buttons.push({ label: 'Start round 1', action: onStartNextRound })
  } else if (round.phase === Phase.OPEN) {
    buttons.push({ label: 'Lock round', action: onLock })
  } else if (round.phase === Phase.LOCKED) {
    buttons.push({ label: 'Request randomness', action: onRequestRandomness })
  } else if (round.phase === Phase.RANDOMNESS_PENDING) {
    if (round.randomOutput === ZERO_BYTES32) {
      if (round.randomnessRefunded) {
        buttons.push({ label: 'Cancel and refund entries', action: onCancel })
      } else {
        buttons.push({ label: 'Refund randomness fee', action: onRefund })
      }
    } else {
      buttons.push({ label: 'Settle round', action: onSettle })
    }
  } else if (round.phase === Phase.SETTLED || round.phase === Phase.CANCELLED) {
    buttons.push({ label: 'Start next round', action: onStartNextRound })
  }

  if (buttons.length === 0) {
    return null
  }

  return (
    <section className="rounded-md border border-dashed border-line-2 p-3">
      <h2 className="text-[10px] font-semibold tracking-[0.16em] text-text-3 uppercase">
        Round controls (permissionless)
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {buttons.map((button) => (
          <Button
            key={button.label}
            size="sm"
            variant="secondary"
            onClick={button.action}
            disabled={isSubmitting}
          >
            {button.label}
          </Button>
        ))}
      </div>
    </section>
  )
}
