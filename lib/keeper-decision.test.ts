import { describe, expect, it } from 'vitest'
import { decideKeeperAction, type KeeperInput } from './keeper-decision'
import { Phase, ZERO_BYTES32 } from './types'

const OUTPUT = `0x${'ab'.repeat(32)}` as const

function input(overrides: Partial<KeeperInput> = {}): KeeperInput {
  return {
    roundId: 7n,
    phase: Phase.WAITING,
    now: 10_000n,
    closeAt: 10_060n,
    randomOutput: ZERO_BYTES32,
    randomnessRefunded: false,
    lockedAt: 0n,
    requestedAt: 0n,
    lockedCancelDelay: 3_600n,
    forceCancelDelay: 86_400n,
    treasury: 1_000_000n,
    randomnessFee: 25_000n,
    refundWindowOpen: false,
    keeperBalance: 5_000_000n,
    minKeeperBalance: 2_000_000n,
    ...overrides,
  }
}

describe('decideKeeperAction decision table', () => {
  it('starts the first round when no round exists', () => {
    expect(decideKeeperAction(input({ roundId: 0n, phase: Phase.NONE }))).toEqual({
      action: 'startNextRound',
      alerts: [],
    })
  })

  it('starts the next round after a settled or cancelled round', () => {
    expect(decideKeeperAction(input({ phase: Phase.SETTLED })).action).toBe('startNextRound')
    expect(decideKeeperAction(input({ phase: Phase.CANCELLED })).action).toBe('startNextRound')
  })

  it('does nothing while the round waits for the first entry', () => {
    expect(decideKeeperAction(input({ phase: Phase.WAITING }))).toEqual({
      action: null,
      alerts: [],
    })
  })

  it('does nothing while the round is open before its deadline', () => {
    expect(decideKeeperAction(input({ phase: Phase.OPEN, now: 10_059n }))).toEqual({
      action: null,
      alerts: [],
    })
  })

  it('locks at and after the deadline', () => {
    expect(decideKeeperAction(input({ phase: Phase.OPEN, now: 10_060n })).action).toBe('lock')
    expect(decideKeeperAction(input({ phase: Phase.OPEN, now: 10_500n })).action).toBe('lock')
  })

  it('requests randomness on a locked round when the treasury covers the fee', () => {
    const decision = decideKeeperAction(
      input({ phase: Phase.LOCKED, lockedAt: 10_061n, now: 10_100n }),
    )
    expect(decision).toEqual({ action: 'requestRandomness', alerts: [] })
  })

  it('requests when the treasury equals the fee exactly', () => {
    const decision = decideKeeperAction(
      input({ phase: Phase.LOCKED, lockedAt: 10_061n, treasury: 25_000n }),
    )
    expect(decision.action).toBe('requestRandomness')
  })

  it('alerts treasury_low and sends nothing when the treasury cannot pay the fee', () => {
    const decision = decideKeeperAction(
      input({ phase: Phase.LOCKED, lockedAt: 10_061n, treasury: 24_999n }),
    )
    expect(decision).toEqual({ action: null, alerts: ['treasury_low'] })
  })

  it('settles a pending round that has a stored output', () => {
    const decision = decideKeeperAction(
      input({ phase: Phase.RANDOMNESS_PENDING, randomOutput: OUTPUT, requestedAt: 10_090n }),
    )
    expect(decision).toEqual({ action: 'settle', alerts: [] })
  })

  it('waits on a pending round without output before the refund window', () => {
    const decision = decideKeeperAction(
      input({ phase: Phase.RANDOMNESS_PENDING, requestedAt: 10_090n, refundWindowOpen: false }),
    )
    expect(decision).toEqual({ action: null, alerts: [] })
  })

  it('refunds the randomness fee past the refund window', () => {
    const decision = decideKeeperAction(
      input({ phase: Phase.RANDOMNESS_PENDING, requestedAt: 10_090n, refundWindowOpen: true }),
    )
    expect(decision).toEqual({ action: 'refundRandomness', alerts: [] })
  })

  it('only alerts after the fee was refunded without an output, because a cancel is a deliberate action', () => {
    const decision = decideKeeperAction(
      input({
        phase: Phase.RANDOMNESS_PENDING,
        requestedAt: 10_090n,
        randomnessRefunded: true,
        refundWindowOpen: true,
      }),
    )
    expect(decision).toEqual({ action: null, alerts: ['round_stalled'] })
  })

  it('alerts unknown_phase and sends nothing for a phase the keeper does not know', () => {
    expect(decideKeeperAction(input({ phase: 9 }))).toEqual({
      action: null,
      alerts: ['unknown_phase'],
    })
  })
})

describe('decideKeeperAction alerts', () => {
  it('adds keeper_balance_low next to a valid action and still sends it', () => {
    const decision = decideKeeperAction(input({ phase: Phase.SETTLED, keeperBalance: 1_999_999n }))
    expect(decision).toEqual({ action: 'startNextRound', alerts: ['keeper_balance_low'] })
  })

  it('does not alert at exactly the minimum balance', () => {
    const decision = decideKeeperAction(input({ phase: Phase.SETTLED, keeperBalance: 2_000_000n }))
    expect(decision.alerts).toEqual([])
  })

  it('treats round_stalled as additive on a locked round: still requests, plus the alert', () => {
    const decision = decideKeeperAction(
      input({ phase: Phase.LOCKED, lockedAt: 1_000n, now: 4_600n }),
    )
    expect(decision).toEqual({ action: 'requestRandomness', alerts: ['round_stalled'] })
  })

  it('does not mark a locked round stalled one second before the cancel delay', () => {
    const decision = decideKeeperAction(
      input({ phase: Phase.LOCKED, lockedAt: 1_000n, now: 4_599n }),
    )
    expect(decision.alerts).toEqual([])
  })

  it('combines treasury_low and round_stalled on a locked round past its delay', () => {
    const decision = decideKeeperAction(
      input({ phase: Phase.LOCKED, lockedAt: 1_000n, now: 5_000n, treasury: 0n }),
    )
    expect(decision.action).toBeNull()
    expect(decision.alerts).toEqual(['treasury_low', 'round_stalled'])
  })

  it('treats a pending round past the force delay as stalled and still settles when it has output', () => {
    const decision = decideKeeperAction(
      input({
        phase: Phase.RANDOMNESS_PENDING,
        randomOutput: OUTPUT,
        requestedAt: 1_000n,
        now: 87_400n,
      }),
    )
    expect(decision).toEqual({ action: 'settle', alerts: ['round_stalled'] })
  })

  it('treats a pending round past the force delay without output as stalled and still refunds when the window is open', () => {
    const decision = decideKeeperAction(
      input({
        phase: Phase.RANDOMNESS_PENDING,
        requestedAt: 1_000n,
        now: 87_400n,
        refundWindowOpen: true,
      }),
    )
    expect(decision).toEqual({ action: 'refundRandomness', alerts: ['round_stalled'] })
  })

  it('lists round_stalled once when refunded and past the force delay', () => {
    const decision = decideKeeperAction(
      input({
        phase: Phase.RANDOMNESS_PENDING,
        requestedAt: 1_000n,
        now: 87_400n,
        randomnessRefunded: true,
      }),
    )
    expect(decision.alerts).toEqual(['round_stalled'])
  })

  it('never returns a cancel or an owner action for any phase', () => {
    const allowed = new Set([
      null,
      'startNextRound',
      'lock',
      'requestRandomness',
      'settle',
      'refundRandomness',
    ])
    for (let phase = 0; phase <= 9; phase += 1) {
      for (const refunded of [false, true]) {
        for (const output of [ZERO_BYTES32, OUTPUT]) {
          const decision = decideKeeperAction(
            input({
              phase,
              randomnessRefunded: refunded,
              randomOutput: output,
              now: 999_999n,
              refundWindowOpen: true,
            }),
          )
          expect(allowed.has(decision.action)).toBe(true)
        }
      }
    }
  })
})

describe('decideKeeperAction plans', () => {
  it('runs a plan batch while the round waits or is open before its deadline', () => {
    expect(decideKeeperAction(input({ phase: Phase.WAITING, planPending: 5n })).action).toBe(
      'executePlans',
    )
    expect(
      decideKeeperAction(
        input({ phase: Phase.OPEN, now: 10_000n, closeAt: 10_060n, planPending: 5n }),
      ).action,
    ).toBe('executePlans')
  })

  it('locks a due round before any plan batch', () => {
    expect(
      decideKeeperAction(
        input({ phase: Phase.OPEN, now: 10_060n, closeAt: 10_060n, planPending: 5n }),
      ).action,
    ).toBe('lock')
  })

  it('does nothing for plans when no position is pending or the round is locked', () => {
    expect(decideKeeperAction(input({ phase: Phase.WAITING, planPending: 0n })).action).toBeNull()
    expect(
      decideKeeperAction(input({ phase: Phase.LOCKED, lockedAt: 9_999n, planPending: 5n })).action,
    ).toBe('requestRandomness')
  })

  it('raises the balance alert threshold by one minimum per batch of 20 active plans', () => {
    const base = { keeperBalance: 5_000_000n, minKeeperBalance: 2_000_000n }
    expect(decideKeeperAction(input({ ...base, activePlanCount: 0n })).alerts).toEqual([])
    expect(decideKeeperAction(input({ ...base, activePlanCount: 20n })).alerts).toEqual([])
    expect(decideKeeperAction(input({ ...base, activePlanCount: 21n })).alerts).toEqual([
      'keeper_balance_low',
    ])
  })
})
