import { describe, expect, it } from 'vitest'
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

const SECRET = 'a'.repeat(40)
const WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const NOW = 1_800_000_000_000

describe('signInMessage', () => {
  it('names the wallet, the chain, and the issue time and nothing else', () => {
    expect(
      signInMessage({ wallet: WALLET, chainId: 46630, issuedAt: '2026-10-05T00:00:00.000Z' }),
    ).toBe(`POTS chat sign-in\nWallet: ${WALLET}\nChain: 46630\nIssued: 2026-10-05T00:00:00.000Z`)
  })
})

describe('issuedAtInWindow', () => {
  const at = (ms: number) => new Date(ms).toISOString()
  it('accepts a time from 5 minutes ago to 30 seconds ahead', () => {
    expect(issuedAtInWindow(at(NOW), NOW)).toBe(true)
    expect(issuedAtInWindow(at(NOW - 5 * 60_000), NOW)).toBe(true)
    expect(issuedAtInWindow(at(NOW + 30_000), NOW)).toBe(true)
  })
  it('refuses older, later, and malformed times', () => {
    expect(issuedAtInWindow(at(NOW - 5 * 60_000 - 1), NOW)).toBe(false)
    expect(issuedAtInWindow(at(NOW + 30_001), NOW)).toBe(false)
    expect(issuedAtInWindow('yesterday', NOW)).toBe(false)
    expect(issuedAtInWindow('2026-10-05', NOW)).toBe(false)
  })
})

describe('session token', () => {
  it('round-trips the wallet in lowercase', () => {
    const token = createToken(WALLET, SECRET, NOW)
    expect(readToken(token, SECRET, NOW + 1000)).toBe(WALLET.toLowerCase())
  })

  it('expires after 12 hours', () => {
    const token = createToken(WALLET, SECRET, NOW)
    expect(readToken(token, SECRET, NOW + (SESSION_TTL_SECONDS - 5) * 1000)).not.toBeNull()
    expect(readToken(token, SECRET, NOW + (SESSION_TTL_SECONDS + 1) * 1000)).toBeNull()
  })

  it('rejects a token signed with another secret, a changed payload, and malformed tokens', () => {
    const token = createToken(WALLET, SECRET, NOW)
    expect(readToken(token, 'b'.repeat(40), NOW)).toBeNull()
    const [payload, signature] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({ w: '0x' + '1'.repeat(40), exp: Math.floor(NOW / 1000) + 99999 }),
    ).toString('base64url')
    expect(readToken(`${forged}.${signature}`, SECRET, NOW)).toBeNull()
    expect(readToken(`${payload}.`, SECRET, NOW)).toBeNull()
    expect(readToken(`${payload}.${signature}.x`, SECRET, NOW)).toBeNull()
    expect(readToken('', SECRET, NOW)).toBeNull()
    expect(readToken(undefined, SECRET, NOW)).toBeNull()
  })
})

describe('cookie', () => {
  it('is httpOnly, secure, SameSite Lax, scoped to /api, and lasts 12 hours', () => {
    const cookie = sessionCookie('tok')
    expect(cookie).toContain(`${COOKIE_NAME}=tok`)
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api', 'Max-Age=43200']) {
      expect(cookie).toContain(flag)
    }
  })

  it('reads the named cookie among others', () => {
    expect(readCookie(`a=1; ${COOKIE_NAME}=abc.def; b=2`)).toBe('abc.def')
    expect(readCookie('a=1')).toBeUndefined()
    expect(readCookie(null)).toBeUndefined()
  })
})
