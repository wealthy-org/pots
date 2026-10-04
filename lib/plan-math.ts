export const MAX_PLAN_ROUNDS = 100

/** Wei of one round of a plan: blocks times amount per block. */
export function planRoundCost(squares: number, amountPerSquare: bigint): bigint {
  return BigInt(squares) * amountPerSquare
}

/** Wei a plan needs up front: rounds times blocks times amount per block. */
export function planDeposit(rounds: number, squares: number, amountPerSquare: bigint): bigint {
  return BigInt(rounds) * planRoundCost(squares, amountPerSquare)
}

export type PlanInput = {
  rounds: number
  squares: number
  amountPerSquare: bigint | null
  minAmount?: bigint
  maxAmount?: bigint
  minDeposit?: bigint
  paused: boolean
  planExists: boolean
  capReached: boolean
  registered: boolean
}

/** The reason a plan cannot be started, in plain words, or null when it can. */
export function planBlockReason(input: PlanInput): string | null {
  if (!input.registered) {
    return 'Auto plans are not active on this deployment yet'
  }
  if (input.planExists) {
    return 'You already have a plan. Stop it first'
  }
  if (input.paused) {
    return 'New deploys are paused'
  }
  if (input.capReached) {
    return 'The plan limit is reached. Try again later'
  }
  if (input.squares === 0) {
    return 'Select at least one block'
  }
  if (!Number.isInteger(input.rounds) || input.rounds < 1 || input.rounds > MAX_PLAN_ROUNDS) {
    return 'Choose between 1 and 100 rounds'
  }
  const amount = input.amountPerSquare
  if (amount === null || amount <= 0n) {
    return 'Enter a valid amount'
  }
  if (input.minAmount !== undefined && amount < input.minAmount) {
    return 'The amount is below the minimum per block'
  }
  if (input.maxAmount !== undefined && input.maxAmount !== 0n && amount > input.maxAmount) {
    return 'The amount is above the maximum per block'
  }
  if (
    input.minDeposit !== undefined &&
    planDeposit(input.rounds, input.squares, amount) < input.minDeposit
  ) {
    return 'The plan is below the minimum deposit. Add rounds, blocks, or amount'
  }
  return null
}

/** The block numbers (1 to 25) in a plan's square mask. */
export function squaresFromMask(mask: number): number[] {
  const squares: number[] = []
  for (let square = 1; square <= 25; square += 1) {
    if ((mask >>> (square - 1)) & 1) {
      squares.push(square)
    }
  }
  return squares
}
