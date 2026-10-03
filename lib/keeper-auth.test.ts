import { describe, expect, it } from 'vitest'
import { createFailureLimiter, isAuthorized } from './keeper-auth'

const SECRET = 'a-long-random-secret-of-more-than-32-characters'

describe('isAuthorized', () => {
  it('accepts the exact bearer secret', () => {
    expect(isAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true)
  })

  it('rejects a missing header, a wrong scheme, and a wrong secret', () => {
    expect(isAuthorized(null, SECRET)).toBe(false)
    expect(isAuthorized(SECRET, SECRET)).toBe(false)
    expect(isAuthorized(`Basic ${SECRET}`, SECRET)).toBe(false)
    expect(isAuthorized('Bearer wrong', SECRET)).toBe(false)
    expect(isAuthorized('Bearer ', SECRET)).toBe(false)
  })

  it('rejects a secret that only shares a prefix or differs in length', () => {
    expect(isAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false)
    expect(isAuthorized(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(false)
  })
})

describe('createFailureLimiter', () => {
  it('blocks a source after the maximum number of failures in the window', () => {
    let now = 0
    const limiter = createFailureLimiter({ max: 3, windowMs: 1_000, now: () => now })
    for (let i = 0; i < 2; i += 1) limiter.recordFailure('a')
    expect(limiter.isBlocked('a')).toBe(false)
    limiter.recordFailure('a')
    expect(limiter.isBlocked('a')).toBe(true)
    expect(limiter.isBlocked('b')).toBe(false)
    now = 1_001
    expect(limiter.isBlocked('a')).toBe(false)
  })

  it('starts a new window after the old one expired', () => {
    let now = 0
    const limiter = createFailureLimiter({ max: 2, windowMs: 1_000, now: () => now })
    limiter.recordFailure('a')
    now = 2_000
    limiter.recordFailure('a')
    expect(limiter.isBlocked('a')).toBe(false)
  })

  it('stays bounded when many sources fail', () => {
    const limiter = createFailureLimiter({ max: 1, windowMs: 60_000 })
    for (let i = 0; i < 5_000; i += 1) limiter.recordFailure(`source-${i}`)
    expect(limiter.isBlocked('source-4999')).toBe(true)
  })
})
