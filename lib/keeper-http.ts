import { createFailureLimiter, isAuthorized, type FailureLimiter } from './keeper-auth'
import { validateConfig } from './config'
import { readKeeperConfig, type KeeperConfig } from './keeper-config'
import {
  checkKeeperStatus,
  runKeeper,
  type KeeperChain,
  type KeeperClock,
  type KeeperReport,
} from './keeper-run'

const BUDGET_MS = 25_000
// cron-job.org cuts a request at 30 s; past this the call answers 503 instead of hanging.
const HARD_DEADLINE_MS = 28_000
const POLL_MS = 2_000
// The history write starts only while this much of the call is left, so it cannot push a call past cron-job.org's 30 s.
const HISTORY_LATEST_START_MS = 25_000

export type KeeperHandlerDeps = {
  getEnv: () => Record<string, string | undefined>
  createChain: (config: KeeperConfig) => KeeperChain
  limiter: FailureLimiter
  clock: KeeperClock
  log: (line: string) => void
  /** Best-effort problem history (API-53); absent means no history. It must never throw. */
  recordHistory?: (report: KeeperReport) => Promise<void>
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** Resolves to a 503 rpc_error report when the call outlives the deadline. */
async function withDeadline(work: Promise<KeeperReport>, ms: number): Promise<KeeperReport> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<KeeperReport>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          status: 'error',
          httpStatus: 503,
          actions: [],
          alerts: ['rpc_error'],
          at: new Date().toISOString(),
        }),
      ms,
    )
  })
  try {
    return await Promise.race([work, late])
  } finally {
    clearTimeout(timer)
  }
}

function sourceKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

function publicReport(report: KeeperReport): Omit<KeeperReport, 'httpStatus'> {
  const { httpStatus: _httpStatus, ...rest } = report
  void _httpStatus
  return rest
}

export function createKeeperHandlers(deps: KeeperHandlerDeps) {
  async function handle(
    request: Request,
    run: (chain: KeeperChain, config: KeeperConfig) => Promise<KeeperReport>,
    label: string,
  ): Promise<Response> {
    try {
      const config = readKeeperConfig(deps.getEnv())
      const secretIssue = !config.ok && config.issues.some((i) => i.variable === 'KEEPER_SECRET')
      if (secretIssue) {
        deps.log(JSON.stringify({ keeper: label, result: 'not_configured' }))
        return json({ error: 'keeper_not_configured', variables: ['KEEPER_SECRET'] }, 500)
      }

      const key = sourceKey(request)
      if (deps.limiter.isBlocked(key)) {
        return json({ error: 'too_many_attempts' }, 429)
      }
      const secret = deps.getEnv().KEEPER_SECRET ?? ''
      if (!isAuthorized(request.headers.get('authorization'), secret)) {
        deps.limiter.recordFailure(key)
        return json({ error: 'unauthorized' }, 401)
      }

      const contractIssues = validateConfig(deps.getEnv()).map((issue) => issue.variable)
      const variables = config.ok
        ? contractIssues
        : [...config.issues.map((i) => i.variable), ...contractIssues]
      if (!config.ok || variables.length > 0) {
        deps.log(JSON.stringify({ keeper: label, result: 'not_configured' }))
        return json({ error: 'keeper_not_configured', variables }, 500)
      }

      const chain = deps.createChain(config.config)
      if (chain.accountAllowed) {
        let allowed: boolean
        try {
          allowed = await chain.accountAllowed()
        } catch {
          return json({ status: 'error', actions: [], alerts: ['rpc_error'] }, 503)
        }
        if (!allowed) {
          deps.log(JSON.stringify({ keeper: label, result: 'account_not_allowed' }))
          return json({ error: 'keeper_account_not_allowed' }, 500)
        }
      }

      const startedAt = deps.clock.now()
      const report = await withDeadline(run(chain, config.config), HARD_DEADLINE_MS)
      deps.log(
        JSON.stringify({
          keeper: label,
          status: report.status,
          round: report.round,
          actions: report.actions.map((a) => ({ name: a.name, ok: a.ok, txHash: a.txHash })),
          alerts: report.alerts,
        }),
      )
      // Problem history comes after the answer is decided and changes nothing about it (D-33).
      if (
        label === 'run' &&
        deps.recordHistory &&
        deps.clock.now() - startedAt < HISTORY_LATEST_START_MS
      ) {
        await deps.recordHistory(report).catch(() => undefined)
      }
      return json(publicReport(report), report.httpStatus)
    } catch (error) {
      // A fixed body; the log names only the error class, because a message can carry a key or URL.
      const errorClass = error instanceof Error ? error.name : 'unknown'
      deps.log(JSON.stringify({ keeper: label, result: 'internal_error', errorClass }))
      return json({ error: 'internal_error' }, 500)
    }
  }
  return {
    post: (request: Request) =>
      handle(
        request,
        (chain, config) =>
          runKeeper(chain, {
            minBalanceWei: config.minBalanceWei,
            budgetMs: BUDGET_MS,
            pollMs: POLL_MS,
            clock: deps.clock,
          }),
        'run',
      ),
    get: (request: Request) =>
      handle(
        request,
        (chain, config) =>
          checkKeeperStatus(chain, { minBalanceWei: config.minBalanceWei, clock: deps.clock }),
        'status',
      ),
  }
}

export function createDefaultKeeperHandlers(
  createChain: (config: KeeperConfig) => KeeperChain,
  recordHistory?: (report: KeeperReport) => Promise<void>,
): ReturnType<typeof createKeeperHandlers> {
  return createKeeperHandlers({
    getEnv: () => process.env,
    createChain,
    limiter: createFailureLimiter({ max: 10, windowMs: 60_000 }),
    clock: {
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
    log: (line) => console.info(line),
    recordHistory,
  })
}
