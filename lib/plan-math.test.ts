import { describe, expect, it } from 'vitest'
import {
  MAX_PLAN_ROUNDS,
  planBlockReason,
  planDeposit,
  planRoundCost,
  squaresFromMask,
} from './plan-math'

const ok = {
  rounds: 3,
  squares: 2,
  amountPerSquare: 10n ** 15n,
  minAmount: 10n ** 15n,
  maxAmount: 10n ** 18n,
  minDeposit: 2n * 10n ** 15n,
  paused: false,
  planExists: false,
  capReached: false,
  registered: true,
}

describe('plan math', () => {
  it('multiplies rounds, blocks, and amount in integer wei', () => {
    expect(planRoundCost(2, 10n ** 15n)).toBe(2n * 10n ** 15n)
    expect(planDeposit(3, 2, 10n ** 15n)).toBe(6n * 10n ** 15n)
    expect(planDeposit(1, 1, 1n)).toBe(1n)
    expect(planDeposit(MAX_PLAN_ROUNDS, 25, 10n ** 18n)).toBe(2500n * 10n ** 18n)
  })

  it('accepts a valid plan', () => {
    expect(planBlockReason(ok)).toBeNull()
  })

  it('explains each reason in the order a player would fix it', () => {
    expect(planBlockReason({ ...ok, registered: false })).toMatch(/not active/)
    expect(planBlockReason({ ...ok, planExists: true })).toMatch(/already have a plan/)
    expect(planBlockReason({ ...ok, paused: true })).toMatch(/paused/)
    expect(planBlockReason({ ...ok, capReached: true })).toMatch(/limit/)
    expect(planBlockReason({ ...ok, squares: 0 })).toMatch(/at least one block/)
    expect(planBlockReason({ ...ok, rounds: 0 })).toMatch(/between 1 and 100/)
    expect(planBlockReason({ ...ok, rounds: 101 })).toMatch(/between 1 and 100/)
    expect(planBlockReason({ ...ok, amountPerSquare: null })).toMatch(/valid amount/)
    expect(planBlockReason({ ...ok, amountPerSquare: 10n ** 14n })).toMatch(/below the minimum per/)
    expect(planBlockReason({ ...ok, amountPerSquare: 2n * 10n ** 18n })).toMatch(
      /above the maximum/,
    )
  })

  it('applies the minimum deposit to the whole plan, not to one round', () => {
    const small = { ...ok, rounds: 1, squares: 1, minDeposit: 5n * 10n ** 15n }
    expect(planBlockReason(small)).toMatch(/minimum deposit/)
    expect(planBlockReason({ ...small, rounds: 5 })).toBeNull()
  })

  it('treats a maximum of 0 as no limit, as the contract does', () => {
    expect(planBlockReason({ ...ok, maxAmount: 0n, amountPerSquare: 50n * 10n ** 18n })).toBeNull()
  })

  it('reads the block numbers from the square mask', () => {
    expect(squaresFromMask(0b11)).toEqual([1, 2])
    expect(squaresFromMask(1 << 24)).toEqual([25])
    expect(squaresFromMask(0x1ffffff)).toHaveLength(25)
    expect(squaresFromMask(0)).toEqual([])
  })
})
