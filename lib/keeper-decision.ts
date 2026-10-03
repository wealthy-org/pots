import { Phase, ZERO_BYTES32 } from './types'

export type KeeperAction =
  'startNextRound' | 'lock' | 'requestRandomness' | 'settle' | 'refundRandomness'

export type KeeperAlert = 'keeper_balance_low' | 'treasury_low' | 'round_stalled' | 'unknown_phase'

export type KeeperInput = {
  roundId: bigint
  phase: number
  now: bigint
  closeAt: bigint
  randomOutput: `0x${string}`
  randomnessRefunded: boolean
  lockedAt: bigint
  requestedAt: bigint
  lockedCancelDelay: bigint
  forceCancelDelay: bigint
  treasury: bigint
  randomnessFee: bigint
  refundWindowOpen: boolean
  keeperBalance: bigint
  minKeeperBalance: bigint
}

export type KeeperDecision = {
  action: KeeperAction | null
  alerts: KeeperAlert[]
}

const KNOWN_PHASES: number[] = [
  Phase.NONE,
  Phase.WAITING,
  Phase.OPEN,
  Phase.LOCKED,
  Phase.RANDOMNESS_PENDING,
  Phase.SETTLED,
  Phase.CANCELLED,
]

/**
 * Maps the chain state to the one permissible transition and the alerts the
 * owner must see (api.md API-28). Pure: no I/O. It never returns a cancel or
 * an owner call (D-26); a stalled round only adds the `round_stalled` alert.
 */
export function decideKeeperAction(input: KeeperInput): KeeperDecision {
  const alerts: KeeperAlert[] = []
  let action: KeeperAction | null = null

  if (input.keeperBalance < input.minKeeperBalance) {
    alerts.push('keeper_balance_low')
  }

  if (!KNOWN_PHASES.includes(input.phase)) {
    alerts.push('unknown_phase')
    return { action, alerts }
  }

  const hasOutput = input.randomOutput !== ZERO_BYTES32

  switch (input.phase) {
    case Phase.NONE:
    case Phase.SETTLED:
    case Phase.CANCELLED:
      action = 'startNextRound'
      break
    case Phase.WAITING:
      break
    case Phase.OPEN:
      if (input.now >= input.closeAt) {
        action = 'lock'
      }
      break
    case Phase.LOCKED:
      if (input.treasury >= input.randomnessFee) {
        action = 'requestRandomness'
      } else {
        alerts.push('treasury_low')
      }
      if (input.now >= input.lockedAt + input.lockedCancelDelay) {
        alerts.push('round_stalled')
      }
      break
    case Phase.RANDOMNESS_PENDING:
      if (hasOutput) {
        action = 'settle'
      } else if (input.randomnessRefunded) {
        alerts.push('round_stalled')
      } else if (input.refundWindowOpen) {
        action = 'refundRandomness'
      }
      if (
        input.now >= input.requestedAt + input.forceCancelDelay &&
        !alerts.includes('round_stalled')
      ) {
        alerts.push('round_stalled')
      }
      break
  }

  return { action, alerts }
}
