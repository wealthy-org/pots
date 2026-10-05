import { describe, expect, it, vi } from 'vitest'
import { createFailureLimiter } from './keeper-auth'
import { createKeeperHandlers, type KeeperHandlerDeps } from './keeper-http'
import { KeeperChainError, type KeeperChain, type KeeperChainState } from './keeper-run'
import { Phase, ZERO_BYTES32 } from './types'

const SECRET = 'a-long-random-secret-of-more-than-32-characters'
const KEY = `0x${'7'.repeat(64)}`
// The local chain id needs no contract addresses, so only the keeper variables are under test.
const LOCAL = { NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: '31337' }

const settled: KeeperChainState = {
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
}

function setup(
  overrides: {
    env?: Record<string, string | undefined>
    chain?: KeeperChain
    recordHistory?: KeeperHandlerDeps['recordHistory']
    now?: () => number
  } = {},
) {
  const logs: string[] = []
  const sent: string[] = []
  let current = settled
  const chain: KeeperChain = overrides.chain ?? {
    async readState() {
      return current
    },
    async send(action) {
      sent.push(action)
      current = { ...settled, roundId: 4n, phase: Phase.WAITING }
      return { txHash: `0x${'a'.repeat(64)}` }
    },
  }
  const deps: KeeperHandlerDeps = {
    getEnv: () => overrides.env ?? { ...LOCAL, KEEPER_PRIVATE_KEY: KEY, KEEPER_SECRET: SECRET },
    createChain: () => chain,
    limiter: createFailureLimiter({ max: 3, windowMs: 60_000 }),
    clock: { now: overrides.now ?? (() => 1_700_000_000_000), sleep: async () => undefined },
    log: (line) => logs.push(line),
    recordHistory: overrides.recordHistory,
  }
  return { handlers: createKeeperHandlers(deps), logs, sent }
}

function request(method: 'POST' | 'GET', token?: string, ip = '203.0.113.9'): Request {
  const headers: Record<string, string> = { 'x-forwarded-for': ip }
  if (token !== undefined) headers.authorization = `Bearer ${token}`
  return new Request('https://pots.example/api/keeper', { method, headers })
}

describe('POST /api/keeper', () => {
  it('rejects a missing and a wrong secret with 401 and no detail', async () => {
    const { handlers, sent } = setup()
    const missing = await handlers.post(request('POST'))
    const wrong = await handlers.post(request('POST', 'wrong'))
    expect(missing.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toEqual({ error: 'unauthorized' })
    expect(sent).toEqual([])
  })

  it('runs the keeper with the correct secret', async () => {
    const { handlers, sent } = setup()
    const response = await handlers.post(request('POST', SECRET))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.round).toEqual({ id: '4', phase: 'WAITING' })
    expect(body.httpStatus).toBeUndefined()
    expect(sent).toEqual(['startNextRound'])
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('answers 429 after repeated failed attempts from one source, even with the right secret', async () => {
    const { handlers } = setup()
    for (let i = 0; i < 3; i += 1) await handlers.post(request('POST', 'wrong'))
    const blocked = await handlers.post(request('POST', SECRET))
    expect(blocked.status).toBe(429)
    const other = await handlers.post(request('POST', SECRET, '198.51.100.4'))
    expect(other.status).toBe(200)
  })

  it('answers 500 naming only the secret variable when the secret is missing, before any auth', async () => {
    const { handlers } = setup({ env: { ...LOCAL, KEEPER_PRIVATE_KEY: KEY } })
    const response = await handlers.post(request('POST', 'anything'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'keeper_not_configured',
      variables: ['KEEPER_SECRET'],
    })
  })

  it('answers 500 naming the missing key variable only after a correct secret', async () => {
    const { handlers } = setup({ env: { ...LOCAL, KEEPER_SECRET: SECRET } })
    const unauthorized = await handlers.post(request('POST', 'wrong'))
    expect(unauthorized.status).toBe(401)
    const response = await handlers.post(request('POST', SECRET))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'keeper_not_configured',
      variables: ['KEEPER_PRIVATE_KEY'],
    })
  })

  it('answers 503 with rpc_error when the chain is unreachable', async () => {
    const chain: KeeperChain = {
      readState: async () => {
        throw new KeeperChainError('rpc_error')
      },
      send: async () => ({ txHash: '0x' }),
    }
    const { handlers } = setup({ chain })
    const response = await handlers.post(request('POST', SECRET))
    expect(response.status).toBe(503)
    expect((await response.json()).alerts).toEqual(['rpc_error'])
  })

  it('never puts the key or the secret into a response body or a log line', async () => {
    const { handlers, logs } = setup()
    const bodies: string[] = []
    for (const token of [SECRET, 'wrong', undefined]) {
      const response = await handlers.post(request('POST', token))
      bodies.push(await response.text())
    }
    const missingKey = setup({ env: { ...LOCAL, KEEPER_SECRET: SECRET } })
    bodies.push(await (await missingKey.handlers.post(request('POST', SECRET))).text())
    const everything = [...bodies, ...logs, ...missingKey.logs].join('\n')
    expect(everything).not.toContain(SECRET)
    expect(everything).not.toContain(KEY)
    expect(everything).not.toContain(KEY.slice(2))
    expect(logs.length).toBeGreaterThan(0)
  })
})

describe('GET /api/keeper/status', () => {
  it('requires the bearer secret', async () => {
    const { handlers } = setup()
    expect((await handlers.get(request('GET'))).status).toBe(401)
  })

  it('answers 200 with no alerts and sends no transaction', async () => {
    const { handlers, sent } = setup()
    const response = await handlers.get(request('GET', SECRET))
    expect(response.status).toBe(200)
    expect((await response.json()).alerts).toEqual([])
    expect(sent).toEqual([])
  })

  it('answers 503 with the alert list while an alert is active', async () => {
    const chain: KeeperChain = {
      readState: async () => ({ ...settled, keeperBalance: 0n }),
      send: async () => {
        throw new Error('status must never send')
      },
    }
    const { handlers } = setup({ chain })
    const response = await handlers.get(request('GET', SECRET))
    expect(response.status).toBe(503)
    expect((await response.json()).alerts).toEqual(['keeper_balance_low'])
  })
})

describe('keeper handler hardening', () => {
  it('answers a fixed 500 and a fixed log line when something throws, never the raw error', async () => {
    const leak = `https://rpc.example/key-${'9'.repeat(8)}`
    const { handlers, logs } = setup()
    const throwing = createKeeperHandlers({
      getEnv: () => ({ ...LOCAL, KEEPER_PRIVATE_KEY: KEY, KEEPER_SECRET: SECRET }),
      createChain: () => {
        throw new Error(leak)
      },
      limiter: createFailureLimiter({ max: 3, windowMs: 60_000 }),
      clock: { now: () => 1_700_000_000_000, sleep: async () => undefined },
      log: (line) => logs.push(line),
    })
    const response = await throwing.post(request('POST', SECRET))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'internal_error' })
    expect(logs.join('\n')).not.toContain(leak)
    expect(logs.join('\n')).toContain('internal_error')
    expect((await handlers.post(request('POST', SECRET))).status).toBe(200)
  })

  it('answers 500 naming the contract variables when the contract configuration is invalid', async () => {
    const { handlers } = setup({
      env: {
        NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: '46630',
        KEEPER_PRIVATE_KEY: KEY,
        KEEPER_SECRET: SECRET,
      },
    })
    const response = await handlers.post(request('POST', SECRET))
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('keeper_not_configured')
    expect(body.variables).toContain('NEXT_PUBLIC_ROUND_MANAGER_ADDRESS')
  })

  it('refuses an account the chain says is not allowed, such as the mainnet owner', async () => {
    const chain: KeeperChain = {
      accountAllowed: async () => false,
      readState: async () => settled,
      send: async () => {
        throw new Error('must not send')
      },
    }
    const { handlers, sent } = setup({ chain })
    const response = await handlers.post(request('POST', SECRET))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'keeper_account_not_allowed' })
    expect(sent).toEqual([])
  })

  it('answers 503 rpc_error when the account check cannot reach the chain', async () => {
    const chain: KeeperChain = {
      accountAllowed: async () => {
        throw new KeeperChainError('rpc_error')
      },
      readState: async () => settled,
      send: async () => ({ txHash: '0x' }),
    }
    const { handlers } = setup({ chain })
    const response = await handlers.post(request('POST', SECRET))
    expect(response.status).toBe(503)
    expect((await response.json()).alerts).toEqual(['rpc_error'])
  })
})

describe('keeper handler deadline', () => {
  it('answers 503 rpc_error instead of hanging when the chain never answers', async () => {
    vi.useFakeTimers()
    try {
      const chain: KeeperChain = {
        readState: () => new Promise<KeeperChainState>(() => undefined),
        send: async () => ({ txHash: '0x' }),
      }
      const { handlers } = setup({ chain })
      const pending = handlers.post(request('POST', SECRET))
      await vi.advanceTimersByTimeAsync(28_001)
      const response = await pending
      expect(response.status).toBe(503)
      expect((await response.json()).alerts).toEqual(['rpc_error'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('logs only the error class of an unexpected failure', async () => {
    const { logs } = setup()
    const throwing = createKeeperHandlers({
      getEnv: () => ({ ...LOCAL, KEEPER_PRIVATE_KEY: KEY, KEEPER_SECRET: SECRET }),
      createChain: () => {
        throw new TypeError('https://rpc.example/secret-path')
      },
      limiter: createFailureLimiter({ max: 3, windowMs: 60_000 }),
      clock: { now: () => 1_700_000_000_000, sleep: async () => undefined },
      log: (line) => logs.push(line),
    })
    await throwing.post(request('POST', SECRET))
    expect(logs.join('\n')).toContain('TypeError')
    expect(logs.join('\n')).not.toContain('secret-path')
  })
})

describe('keeper problem history', () => {
  const broken: KeeperChain = {
    async readState() {
      throw new KeeperChainError('rpc_error')
    },
    async send() {
      return { txHash: '0x' }
    },
  }

  it('records a problem run after the answer is decided and does not change the answer', async () => {
    const seen: string[] = []
    const { handlers } = setup({
      chain: broken,
      recordHistory: async (report) => void seen.push(report.alerts.join(',')),
    })
    const response = await handlers.post(request('POST', SECRET))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ alerts: ['rpc_error'] })
    expect(seen).toEqual(['rpc_error'])
  })

  it('answers the same when the history writer rejects', async () => {
    const plain = setup({ chain: broken })
    const withFailure = setup({
      chain: broken,
      recordHistory: async () => {
        throw new Error('database down')
      },
    })
    const a = await plain.handlers.post(request('POST', SECRET))
    const b = await withFailure.handlers.post(request('POST', SECRET))
    expect(b.status).toBe(a.status)
    expect(await b.json()).toEqual(await a.json())
  })

  it('does not record for the read-only status call', async () => {
    const recordHistory = vi.fn(async () => undefined)
    const { handlers } = setup({ chain: broken, recordHistory })
    await handlers.get(request('GET', SECRET))
    expect(recordHistory).not.toHaveBeenCalled()
  })

  it('skips the history write when the call already used most of its time', async () => {
    let t = 1_700_000_000_000
    const recordHistory = vi.fn(async () => undefined)
    const slow: KeeperChain = {
      async readState() {
        t += 26_000
        throw new KeeperChainError('rpc_error')
      },
      async send() {
        return { txHash: '0x' }
      },
    }
    const { handlers } = setup({ chain: slow, recordHistory, now: () => t })
    await handlers.post(request('POST', SECRET))
    expect(recordHistory).not.toHaveBeenCalled()
  })
})
