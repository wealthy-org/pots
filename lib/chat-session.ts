import { createHmac, timingSafeEqual } from 'node:crypto'
import { signInMessage } from './chat-sign'

export { signInMessage }

export const SESSION_TTL_SECONDS = 12 * 60 * 60
export const COOKIE_NAME = 'pots_chat'
const ISSUED_PAST_MS = 5 * 60 * 1000
const ISSUED_FUTURE_MS = 30 * 1000

/** True when `issuedAt` is an ISO time at most 5 minutes old and at most 30 seconds ahead. */
export function issuedAtInWindow(issuedAt: string, nowMs: number): boolean {
  const time = Date.parse(issuedAt)
  if (!Number.isFinite(time) || new Date(time).toISOString() !== issuedAt) {
    return false
  }
  return time >= nowMs - ISSUED_PAST_MS && time <= nowMs + ISSUED_FUTURE_MS
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createToken(wallet: string, secret: string, nowMs: number): string {
  const payload = Buffer.from(
    JSON.stringify({
      w: wallet.toLowerCase(),
      exp: Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS,
    }),
  ).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

/** The wallet (lowercase) of a valid, unexpired token, or null. The signature is compared in constant time. */
export function readToken(token: string | undefined, secret: string, nowMs: number): string | null {
  if (!token) {
    return null
  }
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) {
    return null
  }
  const expected = Buffer.from(sign(payload, secret))
  const presented = Buffer.from(signature)
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) {
    return null
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      w?: unknown
      exp?: unknown
    }
    if (
      typeof data.w !== 'string' ||
      !/^0x[0-9a-f]{40}$/.test(data.w) ||
      typeof data.exp !== 'number' ||
      data.exp * 1000 <= nowMs
    ) {
      return null
    }
    return data.w
  } catch {
    return null
  }
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=${SESSION_TTL_SECONDS}`
}

export function readCookie(header: string | null, name: string = COOKIE_NAME): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) {
      return rest.join('=')
    }
  }
  return undefined
}
