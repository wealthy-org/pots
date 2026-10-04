import { decideKeeperAction, type KeeperAction, type KeeperAlert } from './keeper-decision'
import { Phase, ZERO_BYTES32 } from './types'

export type KeeperChainState = {
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
  /** Plan positions still to visit for this round; absent or 0 when the plan feature is off. */
  planPending?: bigint
  activePlanCount?: bigint
}

export interface KeeperChain {
  readState(): Promise<KeeperChainState>
  /** `timeoutMs` caps the wait for the receipt so a call stays inside its time budget. */
  send(action: KeeperAction, roundId: bigint, timeoutMs?: number): Promise<{ txHash: string }>
  /** False when the account must not be used as keeper (mainnet: never the manager owner, F-21). */
  accountAllowed?(): Promise<boolean>
}

type KeeperChainErrorKind = 'rpc_error' | 'keeper_balance_low' | 'reverted'

/** Carries a kind and a fixed message only: raw RPC errors can contain URLs with credentials. */
export class KeeperChainError extends Error {
  readonly kind: KeeperChainErrorKind

  constructor(kind: KeeperChainErrorKind) {
    super(kind)
    this.kind = kind
  }
}

export type ReportAlert = KeeperAlert | 'rpc_error'

export type KeeperActionResult = {
  name: KeeperAction
  ok: boolean
  txHash?: string
  reason?: string
}

export type KeeperReport = {
  status: 'ok' | 'noop' | 'error'
  httpStatus: 200 | 503
  round?: { id: string; phase: string }
  actions: KeeperActionResult[]
  alerts: ReportAlert[]
  keeperBalanceWei?: string
  /** Present only while plans exist. */
  plans?: { active: string; pending: string }
  at: string
}

export type KeeperClock = {
  now: () => number
  sleep: (ms: number) => Promise<void>
}

export type KeeperRunOptions = {
  minBalanceWei: bigint
  budgetMs: number
  pollMs: number
  clock: KeeperClock
}

// Only sends count toward a cap; reads and reveal polls are bounded by the time budget.
const MAX_SENDS = 6
// Plan batches are separate sends: 100 plans need 5 calls of 20, on top of the round transitions.
const MAX_PLAN_SENDS = 6
const MAX_ITERATIONS = 40
/** A send needs room for the simulation, the broadcast, and the receipt. Below this the call stops. */
const SEND_RESERVE_MS = 8_000
const SEND_MARGIN_MS = 1_000
const PHASE_NAMES = [
  'NONE',
  'WAITING',
  'OPEN',
  'LOCKED',
  'RANDOMNESS_PENDING',
  'SETTLED',
  'CANCELLED',
]

function phaseName(phase: number): string {
  return PHASE_NAMES[phase] ?? 'UNKNOWN'
}

function describeState(
  state: KeeperChainState,
): Pick<KeeperReport, 'round' | 'keeperBalanceWei' | 'plans'> {
  return {
    round: { id: state.roundId.toString(), phase: phaseName(state.phase) },
    keeperBalanceWei: state.keeperBalance.toString(),
    ...((state.activePlanCount ?? 0n) > 0n
      ? {
          plans: {
            active: (state.activePlanCount ?? 0n).toString(),
            pending: (state.planPending ?? 0n).toString(),
          },
        }
      : {}),
  }
}

function rpcFailure(actions: KeeperActionResult[], at: string): KeeperReport {
  return { status: 'error', httpStatus: 503, actions, alerts: ['rpc_error'], at }
}

/**
 * Advances the round by the permissible transitions, within a time budget (API-28).
 * Idempotent: it reads, decides, then sends one transition at a time. A send that reverted is
 * never sent again in the same call: the next scheduled call resumes from chain state.
 */
export async function runKeeper(
  chain: KeeperChain,
  options: KeeperRunOptions,
): Promise<KeeperReport> {
  const { clock } = options
  const started = clock.now()
  const at = new Date(started).toISOString()
  const actions: KeeperActionResult[] = []
  let alerts: KeeperAlert[] = []
  let last: KeeperChainState | undefined
  let revertedAction: KeeperAction | undefined
  let sends = 0
  let planSends = 0
  let pendingBeforePlanSend: bigint | undefined

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    let state: KeeperChainState
    try {
      state = await chain.readState()
    } catch {
      return { ...rpcFailure(actions, at), ...(last ? describeState(last) : {}) }
    }
    last = state
    const decision = decideKeeperAction({ ...state, minKeeperBalance: options.minBalanceWei })
    alerts = decision.alerts

    if (decision.action && decision.action === revertedAction) {
      break
    }
    if (decision.action === 'executePlans') {
      // A batch that visited nothing (the manager is paused, the round closed) would repeat forever.
      const pending = state.planPending ?? 0n
      if (planSends >= MAX_PLAN_SENDS) {
        break
      }
      if (pendingBeforePlanSend !== undefined && pending >= pendingBeforePlanSend) {
        break
      }
      pendingBeforePlanSend = pending
    } else if (sends >= MAX_SENDS) {
      break
    }

    const budgetLeft = options.budgetMs - (clock.now() - started)
    if (decision.action && budgetLeft > SEND_RESERVE_MS) {
      if (decision.action === 'executePlans') {
        planSends += 1
      } else {
        sends += 1
      }
      try {
        const sent = await chain.send(decision.action, state.roundId, budgetLeft - SEND_MARGIN_MS)
        actions.push({ name: decision.action, ok: true, txHash: sent.txHash })
        revertedAction = undefined
        // A round transition starts a new pass: the plan count of the next round is a fresh one.
        if (decision.action !== 'executePlans') pendingBeforePlanSend = undefined
        continue
      } catch (error) {
        const kind = error instanceof KeeperChainError ? error.kind : 'rpc_error'
        if (kind === 'rpc_error') {
          actions.push({ name: decision.action, ok: false, reason: 'rpc_error' })
          return { ...rpcFailure(actions, at), ...describeState(state) }
        }
        if (kind === 'keeper_balance_low') {
          actions.push({ name: decision.action, ok: false, reason: 'keeper_balance_low' })
          if (!alerts.includes('keeper_balance_low')) alerts = [...alerts, 'keeper_balance_low']
          break
        }
        actions.push({ name: decision.action, ok: false, reason: 'reverted' })
        revertedAction = decision.action
        continue
      }
    }
    if (decision.action) break

    const waitingForReveal =
      state.phase === Phase.RANDOMNESS_PENDING &&
      state.randomOutput === ZERO_BYTES32 &&
      !state.randomnessRefunded &&
      !state.refundWindowOpen
    if (waitingForReveal && budgetLeft > options.pollMs) {
      await clock.sleep(options.pollMs)
      continue
    }
    break
  }

  const status = actions.some((action) => action.ok) ? 'ok' : 'noop'
  return {
    status,
    httpStatus: 200,
    actions,
    alerts,
    at,
    ...(last ? describeState(last) : {}),
  }
}

/** Read-only monitor (API-30): same reads and decision, no transaction. */
export async function checkKeeperStatus(
  chain: KeeperChain,
  options: Pick<KeeperRunOptions, 'minBalanceWei' | 'clock'>,
): Promise<KeeperReport> {
  const at = new Date(options.clock.now()).toISOString()
  let state: KeeperChainState
  try {
    state = await chain.readState()
  } catch {
    return rpcFailure([], at)
  }
  const decision = decideKeeperAction({ ...state, minKeeperBalance: options.minBalanceWei })
  return {
    status: decision.alerts.length > 0 ? 'error' : 'ok',
    httpStatus: decision.alerts.length > 0 ? 503 : 200,
    actions: [],
    alerts: decision.alerts,
    at,
    ...describeState(state),
  }
}
