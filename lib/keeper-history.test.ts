import { describe, expect, it, vi } from 'vitest'
import { createKeeperHistory, shouldRecord, toRow, type KeeperEventRow } from './keeper-history'
import type { KeeperReport } from './keeper-run'

const base: KeeperReport = {
  status: 'ok',
  httpStatus: 200,
  round: { id: '7', phase: 'WAITING' },
  actions: [{ name: 'lock', ok: true, txHash: '0xabc' }],
  alerts: [],
  keeperBalanceWei: '1000',
  at: '2026-10-05T00:00:00.000Z',
}

const alerting: KeeperReport = {
  ...base,
  status: 'error',
  httpStatus: 503,
  alerts: ['keeper_balance_low'],
}
const failing: KeeperReport = {
  ...base,
  actions: [{ name: 'settle', ok: false, reason: 'reverted' }],
}

function make(
  overrides: {
    now?: () => number
    insert?: (row: KeeperEventRow) => Promise<void>
    timeoutMs?: number
  } = {},
) {
  const rows: KeeperEventRow[] = []
  const logs: string[] = []
  let clock = 1_000_000
  const insert = overrides.insert ?? (async (row: KeeperEventRow) => void rows.push(row))
  const record = createKeeperHistory({
    getInsert: () => insert,
    now: overrides.now ?? (() => clock),
    log: (line) => logs.push(line),
    timeoutMs: overrides.timeoutMs,
  })
  return { record, rows, logs, advance: (ms: number) => (clock += ms) }
}

describe('shouldRecord and toRow', () => {
  it('records only a run with an alert or a failed action', () => {
    expect(shouldRecord(base)).toBe(false)
    expect(shouldRecord(alerting)).toBe(true)
    expect(shouldRecord(failing)).toBe(true)
    expect(shouldRecord({ ...base, actions: [], alerts: [] })).toBe(false)
  })

  it('stores names and fixed reasons only', () => {
    const row = toRow({ ...failing, alerts: ['treasury_low'] })
    expect(row).toEqual({
      roundId: '7',
      phase: 'WAITING',
      alerts: ['treasury_low'],
      failedActions: [{ name: 'settle', reason: 'reverted' }],
      httpStatus: 200,
    })
    expect(JSON.stringify(row)).not.toContain('0x')
    expect(JSON.stringify(row)).not.toContain('keeperBalance')
  })
})

describe('createKeeperHistory', () => {
  it('writes nothing for a quiet run', async () => {
    const { record, rows } = make()
    await record(base)
    expect(rows).toEqual([])
  })

  it('writes a problem run once and throttles the same problem for 30 minutes', async () => {
    const { record, rows, advance } = make()
    await record(alerting)
    await record(alerting)
    advance(29 * 60_000)
    await record(alerting)
    expect(rows).toHaveLength(1)
    advance(2 * 60_000)
    await record(alerting)
    expect(rows).toHaveLength(2)
  })

  it('writes a different problem at once', async () => {
    const { record, rows } = make()
    await record(alerting)
    await record(failing)
    expect(rows).toHaveLength(2)
  })

  it('does nothing when the database is not configured', async () => {
    const record = createKeeperHistory({
      getInsert: () => null,
      now: () => 0,
      log: () => undefined,
    })
    await expect(record(alerting)).resolves.toBeUndefined()
  })

  it('swallows a failing write, logs only the error class, and retries on the next run', async () => {
    let fail = true
    const rows: KeeperEventRow[] = []
    const { record, logs } = make({
      insert: async (row) => {
        if (fail) throw new Error('postgres://user:secret@host/db')
        rows.push(row)
      },
    })
    await expect(record(alerting)).resolves.toBeUndefined()
    expect(logs.join('')).toContain('write_failed')
    expect(logs.join('')).not.toContain('secret')
    fail = false
    await record(alerting)
    expect(rows).toHaveLength(1)
  })

  it('cuts off a write that never answers', async () => {
    vi.useFakeTimers()
    try {
      const { record, logs } = make({ insert: () => new Promise(() => undefined), timeoutMs: 2000 })
      const pending = record(alerting)
      await vi.advanceTimersByTimeAsync(2100)
      await expect(pending).resolves.toBeUndefined()
      expect(logs.join('')).toContain('write_failed')
    } finally {
      vi.useRealTimers()
    }
  })
})
