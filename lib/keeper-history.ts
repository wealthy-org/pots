import type { KeeperReport } from './keeper-run'

/** One row of `keeper_events` (schema.md DATA-25): names and fixed reasons only, never a key or URL. */
export type KeeperEventRow = {
  roundId: string | null
  phase: string | null
  alerts: string[]
  failedActions: { name: string; reason: string }[]
  httpStatus: number
}

const THROTTLE_MS = 30 * 60 * 1000
const WRITE_TIMEOUT_MS = 2_000
const MAX_SIGNATURES = 50

/** True only for a run with an alert or a failed action; a quiet run is never recorded (D-33). */
export function shouldRecord(report: KeeperReport): boolean {
  return report.alerts.length > 0 || report.actions.some((action) => !action.ok)
}

export function toRow(report: KeeperReport): KeeperEventRow {
  return {
    roundId: report.round?.id ?? null,
    phase: report.round?.phase ?? null,
    alerts: [...report.alerts],
    failedActions: report.actions
      .filter((action) => !action.ok)
      .map((action) => ({ name: action.name, reason: action.reason ?? 'unknown' })),
    httpStatus: report.httpStatus,
  }
}

function signature(row: KeeperEventRow): string {
  return JSON.stringify([
    [...row.alerts].sort(),
    row.failedActions.map((action) => `${action.name}:${action.reason}`).sort(),
  ])
}

/**
 * Best-effort history writer (api.md API-53). It never throws and never changes the keeper answer:
 * the write is cut off after 2 seconds, its errors are swallowed, and the same problem is written
 * at most once every 30 minutes per function instance, so a long alert does not keep the database
 * awake every minute (L-124, L-130). `insert` `getInsert` returns null when `DATABASE_URL` is unset, read at the point of use.
 */
export function createKeeperHistory(options: {
  getInsert: () => ((row: KeeperEventRow) => Promise<void>) | null
  now: () => number
  log: (line: string) => void
  throttleMs?: number
  timeoutMs?: number
}): (report: KeeperReport) => Promise<void> {
  const written = new Map<string, number>()
  const throttleMs = options.throttleMs ?? THROTTLE_MS
  const timeoutMs = options.timeoutMs ?? WRITE_TIMEOUT_MS

  return async (report) => {
    const insert = options.getInsert()
    if (!insert || !shouldRecord(report)) {
      return
    }
    const row = toRow(report)
    const key = signature(row)
    const last = written.get(key)
    if (last !== undefined && options.now() - last < throttleMs) {
      return
    }
    if (written.size >= MAX_SIGNATURES) {
      written.clear()
    }
    written.set(key, options.now())
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        insert(row),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
        }),
      ])
    } catch (error) {
      // A failed write is retried by the next run: forget the throttle entry.
      written.delete(key)
      const errorClass = error instanceof Error ? error.name : 'unknown'
      options.log(JSON.stringify({ keeper: 'history', result: 'write_failed', errorClass }))
    } finally {
      clearTimeout(timer)
    }
  }
}
