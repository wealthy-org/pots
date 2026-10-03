'use client'

import { Button } from '@/components/ui/button'
import { formatRemaining, useCountdown } from '@/hooks/use-countdown'
import { Phase, ZERO_BYTES32, type RoundData } from '@/lib/types'

export function KeeperPanel({
  roundId,
  round,
  escapeAt,
  onLock,
  onRequestRandomness,
  onSettle,
  onRefund,
  onCancel,
  isSubmitting,
}: {
  roundId?: bigint
  round?: RoundData
  escapeAt?: bigint
  onLock: () => void
  onRequestRandomness: () => void
  onSettle: () => void
  onRefund: () => void
  onCancel: () => void
  isSubmitting: boolean
}) {
  const remaining = useCountdown(escapeAt)

  if (roundId === undefined) {
    return null
  }

  const buttons: Array<{ label: string; action: () => void }> = []
  let escapeNote: string | null = null
  const escapeReady = escapeAt !== undefined && remaining === 0

  if (!round || roundId === 0n) {
    return null
  }
  if (round.phase === Phase.OPEN) {
    buttons.push({ label: 'Lock round', action: onLock })
  } else if (round.phase === Phase.LOCKED) {
    buttons.push({ label: 'Request randomness', action: onRequestRandomness })
    if (escapeReady) {
      buttons.push({ label: 'Cancel round and refund deploys', action: onCancel })
    } else if (escapeAt !== undefined) {
      escapeNote = `If randomness cannot be requested, anyone can cancel this round and refund every deploy in ${formatRemaining(remaining)}.`
    }
  } else if (round.phase === Phase.RANDOMNESS_PENDING) {
    if (round.randomOutput === ZERO_BYTES32) {
      if (round.randomnessRefunded) {
        buttons.push({ label: 'Cancel and refund deploys', action: onCancel })
      } else {
        buttons.push({ label: 'Refund randomness fee', action: onRefund })
        if (escapeReady) {
          buttons.push({ label: 'Cancel and refund deploys', action: onCancel })
        } else if (escapeAt !== undefined) {
          escapeNote = `If the randomness refund keeps failing, anyone can cancel this round and refund every deploy in ${formatRemaining(remaining)}.`
        }
      }
    } else {
      buttons.push({ label: 'Settle round', action: onSettle })
    }
  }

  if (buttons.length === 0) {
    return null
  }

  return (
    <section className="rounded-md border border-dashed border-line-2 p-3">
      <h2 className="text-[11px] font-semibold tracking-[0.16em] text-text-3 uppercase">
        Operator fallbacks (anyone can use these)
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
      {escapeNote ? <p className="mt-2 text-xs text-text-2">{escapeNote}</p> : null}
    </section>
  )
}
