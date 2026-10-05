import { getAddress, isAddress } from 'viem'
import { createFailureLimiter, isAuthorized, type FailureLimiter } from './keeper-auth'
import { normalizeBody } from './chat-text'
import {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createToken,
  issuedAtInWindow,
  readCookie,
  readToken,
  sessionCookie,
  signInMessage,
} from './chat-session'
import type { ChatStore } from './chat-store'
import { validateNickname } from './nickname'

type Env = Record<string, string | undefined>

export type ChatHandlerDeps = {
  getEnv: () => Env
  /** The database store, or null when `DATABASE_URL` is unset. */
  getStore: () => ChatStore | null
  verifySignature: (input: {
    wallet: `0x${string}`
    message: string
    signature: `0x${string}`
  }) => Promise<boolean>
  limiter: FailureLimiter
  /** Counts reads that reached the function (cache misses): API-49 is public, so it needs a ceiling. */
  readLimiter: FailureLimiter
  now: () => number
  log: (line: string) => void
  chainId: () => number
}

const MIN_SECRET_LENGTH = 32
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

function fail(code: string, status: number, headers: Record<string, string> = {}): Response {
  return json({ error: code }, status, headers)
}

function sourceKey(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

/** Writes must come from the app's own pages: an Origin that matches the host. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host) {
    return false
  }
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function sameOriginJson(request: Request): boolean {
  return (
    (request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json') &&
    sameOrigin(request)
  )
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json()
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function createChatHandlers(deps: ChatHandlerDeps) {
  function secret(): string | null {
    const value = deps.getEnv().CHAT_SESSION_SECRET
    return value && value.length >= MIN_SECRET_LENGTH ? value : null
  }

  function sessionWallet(request: Request): string | null {
    const key = secret()
    return key
      ? readToken(readCookie(request.headers.get('cookie'), COOKIE_NAME), key, deps.now())
      : null
  }

  /** Runs a database call; any failure becomes a fixed 503 and the log names only the error class. */
  async function guarded(label: string, work: () => Promise<Response>): Promise<Response> {
    try {
      return await work()
    } catch (error) {
      const errorClass = error instanceof Error ? error.name : 'unknown'
      deps.log(JSON.stringify({ chat: label, result: 'unavailable', errorClass }))
      return fail('CHAT_UNAVAILABLE', 503)
    }
  }

  return {
    /** API-48: a wallet signature becomes a 12 hour cookie. No database access. */
    async session(request: Request): Promise<Response> {
      const key = secret()
      if (!key) {
        return fail('CHAT_UNAVAILABLE', 503)
      }
      if (!sameOriginJson(request)) {
        return fail('CHAT_BAD_ORIGIN', 403)
      }
      const source = sourceKey(request)
      if (deps.limiter.isBlocked(source)) {
        return fail('CHAT_RATE_LIMITED', 429, { 'Retry-After': '60' })
      }
      const body = await readJson(request)
      const { wallet, issuedAt, signature } = body ?? {}
      if (
        typeof wallet !== 'string' ||
        !isAddress(wallet, { strict: false }) ||
        typeof issuedAt !== 'string' ||
        typeof signature !== 'string' ||
        !/^0x[0-9a-fA-F]{130,}$/.test(signature)
      ) {
        return fail('CHAT_INVALID', 400)
      }
      const checksummed = getAddress(wallet)
      const message = signInMessage({
        wallet: checksummed,
        chainId: deps.chainId(),
        issuedAt,
      })
      let valid = false
      if (issuedAtInWindow(issuedAt, deps.now())) {
        try {
          valid = await deps.verifySignature({
            wallet: checksummed,
            message,
            signature: signature as `0x${string}`,
          })
        } catch {
          valid = false
        }
      }
      if (!valid) {
        deps.limiter.recordFailure(source)
        return fail('CHAT_BAD_SIGNATURE', 401)
      }
      const token = createToken(checksummed, key, deps.now())
      return json(
        {
          wallet: checksummed.toLowerCase(),
          expiresAt: new Date(deps.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
        },
        200,
        { 'Set-Cookie': sessionCookie(token) },
      )
    },

    /** API-49: the current UTC day, public. */
    async listMessages(request: Request): Promise<Response> {
      const store = deps.getStore()
      if (!store) {
        return fail('CHAT_UNAVAILABLE', 503)
      }
      const params = new URL(request.url).searchParams
      const afterRaw = params.get('after')
      const limitRaw = params.get('limit')
      const after = afterRaw !== null && /^\d{1,15}$/.test(afterRaw) ? Number(afterRaw) : undefined
      const limit =
        limitRaw !== null && /^\d{1,3}$/.test(limitRaw)
          ? Math.min(MAX_LIMIT, Math.max(1, Number(limitRaw)))
          : DEFAULT_LIMIT
      const source = sourceKey(request)
      if (deps.readLimiter.isBlocked(source)) {
        return fail('CHAT_RATE_LIMITED', 429, { 'Retry-After': '30' })
      }
      deps.readLimiter.recordFailure(source)
      return guarded('list', async () => {
        const messages = await store.list({ after, limit })
        return json({ day: new Date(deps.now()).toISOString().slice(0, 10), messages }, 200, {
          'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=5',
        })
      })
    },

    /** API-50 */
    async postMessage(request: Request): Promise<Response> {
      if (!sameOriginJson(request)) {
        return fail('CHAT_BAD_ORIGIN', 403)
      }
      const wallet = sessionWallet(request)
      if (!wallet) {
        return fail('CHAT_UNAUTHENTICATED', 401)
      }
      const body = await readJson(request)
      const text = normalizeBody(body?.body)
      if (text === null) {
        return fail('CHAT_INVALID', 400)
      }
      const store = deps.getStore()
      if (!store) {
        return fail('CHAT_UNAVAILABLE', 503)
      }
      return guarded('post', async () => {
        const stored = await store.insert(wallet, text)
        if (stored === 'rate_limited') {
          return fail('CHAT_RATE_LIMITED', 429, { 'Retry-After': '3' })
        }
        // A few percent of writes also trim rows older than 48 hours (the daily purge is the main path).
        if (Math.random() < 0.05) {
          await store.trimOld().catch(() => undefined)
        }
        return json({ message: stored }, 201)
      })
    },

    /** API-51 */
    async profile(request: Request): Promise<Response> {
      const method = request.method.toUpperCase()
      // GET reads the caller's own nickname; PUT needs JSON; DELETE has no body.
      if (
        method === 'PUT' ? !sameOriginJson(request) : method === 'DELETE' && !sameOrigin(request)
      ) {
        return fail('CHAT_BAD_ORIGIN', 403)
      }
      const wallet = sessionWallet(request)
      if (!wallet) {
        return fail('CHAT_UNAUTHENTICATED', 401)
      }
      const store = deps.getStore()
      if (!store) {
        return fail('CHAT_UNAVAILABLE', 503)
      }
      if (method === 'GET') {
        return guarded('profile_get', async () =>
          json({ wallet, nickname: await store.getNickname(wallet) }, 200),
        )
      }
      if (method === 'DELETE') {
        return guarded('profile_delete', async () => {
          await store.removeNickname(wallet)
          return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
        })
      }
      if (method === 'PUT') {
        const body = await readJson(request)
        const checked = validateNickname(body?.nickname)
        if (!checked.ok) {
          return fail('NICKNAME_INVALID', 400)
        }
        return guarded('profile_put', async () => {
          const outcome = await store.setNickname(wallet, checked.nickname, checked.lower)
          if (outcome === 'taken') {
            return fail('NICKNAME_TAKEN', 409)
          }
          if (outcome === 'cooldown') {
            return fail('NICKNAME_COOLDOWN', 429, { 'Retry-After': '600' })
          }
          return json({ nickname: checked.nickname }, 200)
        })
      }
      return fail('CHAT_INVALID', 400)
    },

    /** API-52: the daily clean-up, called by the scheduler with the keeper bearer secret (D-34). */
    async purge(request: Request): Promise<Response> {
      const keeperSecret = deps.getEnv().KEEPER_SECRET
      if (!keeperSecret || keeperSecret.length < MIN_SECRET_LENGTH) {
        return fail('CHAT_UNAVAILABLE', 503)
      }
      const source = sourceKey(request)
      if (deps.limiter.isBlocked(source)) {
        return json({ error: 'too_many_attempts' }, 429)
      }
      if (!isAuthorized(request.headers.get('authorization'), keeperSecret)) {
        deps.limiter.recordFailure(source)
        return json({ error: 'unauthorized' }, 401)
      }
      const store = deps.getStore()
      if (!store) {
        return fail('CHAT_UNAVAILABLE', 503)
      }
      return guarded('purge', async () => {
        const result = await store.purge()
        deps.log(JSON.stringify({ chat: 'purge', ...result }))
        return json({ ...result, at: new Date(deps.now()).toISOString() }, 200)
      })
    },
  }
}

export function createDefaultLimiter(): FailureLimiter {
  return createFailureLimiter({ max: 10, windowMs: 60_000 })
}

/** 120 uncached reads a minute per source: a poll every 5 seconds is 12, so several tabs fit. */
export function createReadLimiter(): FailureLimiter {
  return createFailureLimiter({ max: 120, windowMs: 60_000 })
}
