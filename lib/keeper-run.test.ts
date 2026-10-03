import { describe, expect, it } from 'vitest'
import type { KeeperAction } from './keeper-decision'
import {
  KeeperChainError,
  checkKeeperStatus,
  runKeeper,
  type KeeperChain,
  type KeeperChainState,
  type KeeperClock,
} from './keeper-run'
import { Phase, ZERO_BYTES32 } from './types'

const OUTPUT = `0x${'cd'.repeat(32)}` as const

function state(overrides: Partial<KeeperChainState> = {}): KeeperChainState {
  return {
    roundId: 3n,
    phase: Phase.SETTLED,
    now: 1_000n,
    closeAt: 940n,
    randomOutput: ZERO_BYTES32,
    randomnessRefunded: false,
    lockedAt: 0n,
    requestedAt: 0n,
    lockedCancelDelay: 3_600n,
    forceCancelDelay: 86_400n,
    treasury: 10n ** 18n,
    randomnessFee: 25_000_000_000_000n,
    refundWindowOpen: false,
    keeperBalance: 10n ** 18n,
    ...overrides,
  }
}

function fakeClock(): KeeperClock & { elapsed: () => number } {
  let time = 1_700_000_000_000
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms
    },
    elapsed: () => time - 1_700_000_000_000,
  }
}

type Step = {
  send?: KeeperAction
  result?: 'ok' | KeeperChainError['kind']
  next: KeeperChainState
}

/** Replays a scripted chain: each send moves to the next state. */
function scripted(first: KeeperChainState, steps: Step[]) {
  const sent: Array<{ action: KeeperAction; roundId: bigint }> = []
  let current = first
  let index = 0
  let reads = 0
  const chain: KeeperChain = {
    async readState() {
      reads += 1
      return current
    },
    async send(action, roundId) {
      sent.push({ action, roundId })
      const step = steps[index]
      if (!step) throw new Error('unexpected send')
      expect(action).toBe(step.send)
      index += 1
      if (step.result && step.result !== 'ok') throw new KeeperChainError(step.result)
      current = step.next
      return { txHash: `0x${String(index).padStart(64, '0')}` }
    },
  }
  return { chain, sent, reads: () => reads }
}

const options = (clock: KeeperClock) => ({
  minBalanceWei: 2_000_000_000_000_000n,
  budgetMs: 25_000,
  pollMs: 2_000,
  clock,
})

describe('runKeeper', () => {
  it('starts the next round after a settled round and then stops at WAITING', async () => {
    const { chain, sent } = scripted(state({ phase: Phase.SETTLED }), [
      { send: 'startNextRound', next: state({ roundId: 4n, phase: Phase.WAITING }) },
    ])
    const report = await runKeeper(chain, options(fakeClock()))
    expect(sent).toEqual([{ action: 'startNextRound', roundId: 3n }])
    expect(report.status).toBe('ok')
    expect(report.httpStatus).toBe(200)
    expect(report.round).toEqual({ id: '4', phase: 'WAITING' })
    expect(report.actions).toHaveLength(1)
    expect(report.alerts).toEqual([])
  })

  it('reports noop and sends nothing while the round waits for entries', async () => {
    const { chain, sent } = scripted(state({ phase: Phase.WAITING }), [])
    const report = await runKeeper(chain, options(fakeClock()))
    expect(sent).toEqual([])
    expect(report.status).toBe('noop')
    expect(report.httpStatus).toBe(200)
  })

  it('chains lock, request, wait for the reveal, settle, and start the next round in one call', async () => {
    let current = state({ phase: Phase.OPEN, now: 1_000n, closeAt: 1_000n })
    let readsSinceRequest = -1
    const sent: KeeperAction[] = []
    const chain: KeeperChain = {
      async readState() {
        if (readsSinceRequest >= 0) {
          readsSinceRequest += 1
          if (readsSinceRequest >= 3) current = { ...current, randomOutput: OUTPUT }
        }
        return current
      },
      async send(action) {
        sent.push(action)
        if (action === 'lock') current = state({ phase: Phase.LOCKED, lockedAt: 1_001n })
        if (action === 'requestRandomness') {
          current = state({ phase: Phase.RANDOMNESS_PENDING, requestedAt: 1_002n })
          readsSinceRequest = 0
        }
        if (action === 'settle') current = state({ phase: Phase.SETTLED })
        if (action === 'startNextRound') current = state({ roundId: 4n, phase: Phase.WAITING })
        return { txHash: `0x${String(sent.length).padStart(64, '0')}` }
      },
    }
    const clock = fakeClock()
    const report = await runKeeper(chain, options(clock))
    expect(sent).toEqual(['lock', 'requestRandomness', 'settle', 'startNextRound'])
    expect(report.status).toBe('ok')
    expect(report.round).toEqual({ id: '4', phase: 'WAITING' })
    expect(report.actions.every((action) => action.ok)).toBe(true)
    expect(clock.elapsed()).toBe(4_000)
  })
  it('stops polling for the reveal when the budget is used up', async () => {
    const pending = state({ phase: Phase.RANDOMNESS_PENDING, requestedAt: 990n })
    const { chain, sent } = scripted(pending, [])
    const clock = fakeClock()
    const report = await runKeeper(chain, { ...options(clock), budgetMs: 6_000 })
    expect(sent).toEqual([])
    expect(report.status).toBe('noop')
    expect(clock.elapsed()).toBeLessThanOrEqual(8_000)
    expect(clock.elapsed()).toBeGreaterThanOrEqual(4_000)
  })

  it('does not poll once the refund window is open and refunds instead', async () => {
    const pending = state({
      phase: Phase.RANDOMNESS_PENDING,
      requestedAt: 900n,
      refundWindowOpen: true,
    })
    const refunded = state({
      phase: Phase.RANDOMNESS_PENDING,
      requestedAt: 900n,
      randomnessRefunded: true,
    })
    const { chain, sent } = scripted(pending, [{ send: 'refundRandomness', next: refunded }])
    const report = await runKeeper(chain, options(fakeClock()))
    expect(sent.map((s) => s.action)).toEqual(['refundRandomness'])
    expect(report.alerts).toEqual(['round_stalled'])
    expect(report.httpStatus).toBe(200)
  })

  it('never sends a cancel, even for a stalled locked round with a low treasury', async () => {
    const locked = state({
      phase: Phase.LOCKED,
      lockedAt: 1n,
      now: 999_999n,
      treasury: 0n,
    })
    const { chain, sent } = scripted(locked, [])
    const report = await runKeeper(chain, options(fakeClock()))
    expect(sent).toEqual([])
    expect(report.alerts).toEqual(['treasury_low', 'round_stalled'])
    expect(report.httpStatus).toBe(200)
  })

  it('keeps sending on a low keeper balance and reports keeper_balance_low', async () => {
    const { chain, sent } = scripted(state({ phase: Phase.SETTLED, keeperBalance: 1n }), [
      {
        send: 'startNextRound',
        next: state({ roundId: 4n, phase: Phase.WAITING, keeperBalance: 1n }),
      },
    ])
    const report = await runKeeper(chain, options(fakeClock()))
    expect(sent).toHaveLength(1)
    expect(report.alerts).toEqual(['keeper_balance_low'])
    expect(report.httpStatus).toBe(200)
  })

  it('reports keeper_balance_low and stops when a send cannot be paid', async () => {
    const { chain } = scripted(state({ phase: Phase.SETTLED }), [
      { send: 'startNextRound', result: 'keeper_balance_low', next: state() },
    ])
    const report = await runKeeper(chain, options(fakeClock()))
    expect(report.status).toBe('noop')
    expect(report.alerts).toContain('keeper_balance_low')
    expect(report.actions).toEqual([
      { name: 'startNextRound', ok: false, reason: 'keeper_balance_low' },
    ])
    expect(report.httpStatus).toBe(200)
  })

  it('answers 503 with rpc_error when the chain cannot be read', async () => {
    const chain: KeeperChain = {
      readState: async () => {
        throw new KeeperChainError('rpc_error')
      },
      send: async () => ({ txHash: '0x' }),
    }
    const report = await runKeeper(chain, options(fakeClock()))
    expect(report.status).toBe('error')
    expect(report.httpStatus).toBe(503)
    expect(report.alerts).toEqual(['rpc_error'])
  })

  it('answers 503 with rpc_error when a send fails on the network', async () => {
    const { chain } = scripted(state({ phase: Phase.SETTLED }), [
      { send: 'startNextRound', result: 'rpc_error', next: state() },
    ])
    const report = await runKeeper(chain, options(fakeClock()))
    expect(report.httpStatus).toBe(503)
    expect(report.alerts).toEqual(['rpc_error'])
    expect(report.actions[0]).toEqual({ name: 'startNextRound', ok: false, reason: 'rpc_error' })
  })

  it('never sends the same action again after a revert in the same call', async () => {
    const { chain, sent, reads } = scripted(state({ phase: Phase.SETTLED }), [
      { send: 'startNextRound', result: 'reverted', next: state() },
    ])
    const report = await runKeeper(chain, options(fakeClock()))
    expect(sent).toHaveLength(1)
    expect(reads()).toBe(2)
    expect(report.status).toBe('noop')
    expect(report.httpStatus).toBe(200)
    expect(report.actions).toEqual([{ name: 'startNextRound', ok: false, reason: 'reverted' }])
  })

  it('stops without sending when the remaining budget cannot cover a send', async () => {
    const { chain, sent } = scripted(state({ phase: Phase.SETTLED }), [])
    const report = await runKeeper(chain, { ...options(fakeClock()), budgetMs: 7_000 })
    expect(sent).toEqual([])
    expect(report.status).toBe('noop')
  })

  it('caps the receipt wait to the remaining budget', async () => {
    const timeouts: Array<number | undefined> = []
    const chain: KeeperChain = {
      readState: async () => state({ phase: Phase.SETTLED }),
      send: async (_action, _roundId, timeoutMs) => {
        timeouts.push(timeoutMs)
        return { txHash: '0x1' }
      },
    }
    // One send, then the same state again: the loop ends at the step cap with sends only while budget remains.
    await runKeeper(chain, { ...options(fakeClock()), budgetMs: 12_000 })
    expect(timeouts[0]).toBe(11_000)
  })
  it('continues after a lost race when the round has moved on', async () => {
    const { chain, sent } = scripted(state({ phase: Phase.SETTLED }), [
      {
        send: 'startNextRound',
        result: 'reverted',
        next: state(),
      },
    ])
    // Another caller advances the round between the revert and the re-read.
    const original = chain.readState
    let reads = 0
    chain.readState = async () => {
      reads += 1
      return reads === 1 ? original() : state({ roundId: 4n, phase: Phase.WAITING })
    }
    const report = await runKeeper(chain, options(fakeClock()))
    expect(sent).toHaveLength(1)
    expect(report.status).toBe('noop')
    expect(report.round).toEqual({ id: '4', phase: 'WAITING' })
  })

  it('reports an unknown phase without sending', async () => {
    const { chain, sent } = scripted(state({ phase: 9 }), [])
    const report = await runKeeper(chain, options(fakeClock()))
    expect(sent).toEqual([])
    expect(report.alerts).toEqual(['unknown_phase'])
    expect(report.round?.phase).toBe('UNKNOWN')
  })

  it('does not leak anything beyond the documented fields', async () => {
    const { chain } = scripted(state({ phase: Phase.WAITING }), [])
    const report = await runKeeper(chain, options(fakeClock()))
    expect(Object.keys(report).sort()).toEqual(
      ['actions', 'alerts', 'at', 'httpStatus', 'keeperBalanceWei', 'round', 'status'].sort(),
    )
  })
})

describe('checkKeeperStatus', () => {
  const clock = fakeClock()

  it('answers 200 with no alerts and never sends', async () => {
    const { chain, sent } = scripted(state({ phase: Phase.WAITING }), [])
    const report = await checkKeeperStatus(chain, { minBalanceWei: 1n, clock })
    expect(report).toMatchObject({ status: 'ok', httpStatus: 200, alerts: [], actions: [] })
    expect(sent).toEqual([])
  })

  it('answers 503 while an alert is active', async () => {
    const { chain, sent } = scripted(
      state({ phase: Phase.LOCKED, lockedAt: 1n, treasury: 0n, now: 5n }),
      [],
    )
    const report = await checkKeeperStatus(chain, { minBalanceWei: 1n, clock })
    expect(report.httpStatus).toBe(503)
    expect(report.alerts).toEqual(['treasury_low'])
    expect(sent).toEqual([])
  })

  it('answers 503 with rpc_error when the chain cannot be read', async () => {
    const chain: KeeperChain = {
      readState: async () => {
        throw new KeeperChainError('rpc_error')
      },
      send: async () => ({ txHash: '0x' }),
    }
    const report = await checkKeeperStatus(chain, { minBalanceWei: 1n, clock })
    expect(report.httpStatus).toBe(503)
    expect(report.alerts).toEqual(['rpc_error'])
  })
})
