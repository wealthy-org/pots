export const Phase = {
  NONE: 0,
  WAITING: 1,
  OPEN: 2,
  LOCKED: 3,
  RANDOMNESS_PENDING: 4,
  SETTLED: 5,
  CANCELLED: 6,
} as const

export const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const

export type RoundData = {
  phase: number
  closeAt: bigint
  requestedAtBlock: bigint
  settledAt: bigint
  winningSquare: number
  randomnessRequestId: bigint
  jackpotHit: boolean
  randomnessRefunded: boolean
  totalEth: bigint
  rolloverIn: bigint
  randomnessFee: bigint
  winningSquareEth: bigint
  payoutPool: bigint
  jackpotPaidAmount: bigint
  roundingDust: bigint
  randomOutput: `0x${string}`
}

export type WalletRoundData = {
  deposited: bigint
  ethClaimed: boolean
  potsClaimed: boolean
}

export function phaseLabel(phase: number): string {
  switch (phase) {
    case Phase.WAITING:
      return 'Waiting for first entry'
    case Phase.OPEN:
      return 'Open'
    case Phase.LOCKED:
      return 'Locked'
    case Phase.RANDOMNESS_PENDING:
      return 'Randomness pending'
    case Phase.SETTLED:
      return 'Settled'
    case Phase.CANCELLED:
      return 'Cancelled'
    default:
      return 'No round'
  }
}
