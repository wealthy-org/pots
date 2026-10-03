import { createHash, timingSafeEqual } from 'node:crypto'

/** Bearer token check in constant time; both sides are hashed so the lengths never differ. */
export function isAuthorized(header: string | null, secret: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? '')
  const presented = createHash('sha256')
    .update(match?.[1] ?? '')
    .digest()
  const expected = createHash('sha256').update(secret).digest()
  return timingSafeEqual(presented, expected) && match !== null
}

export type FailureLimiter = {
  isBlocked: (key: string) => boolean
  recordFailure: (key: string) => void
}

const MAX_TRACKED_KEYS = 1000

/**
 * Best-effort limiter for failed authentication: an in-memory counter per function instance.
 * It only slows guessing; the long random secret is the real protection (api.md API-28).
 * tradeoff: counters are per instance and reset on a cold start, so the ceiling is a few attempts
 * per instance. Upgrade trigger: the Vercel WAF rate-limit rule on /api/keeper* (Task 8.12).
 */
export function createFailureLimiter(options: {
  max: number
  windowMs: number
  now?: () => number
}): FailureLimiter {
  const now = options.now ?? Date.now
  const entries = new Map<string, { count: number; resetAt: number }>()

  function prune(): void {
    if (entries.size < MAX_TRACKED_KEYS) return
    const current = now()
    for (const [key, entry] of entries) {
      if (entry.resetAt <= current) entries.delete(key)
    }
    if (entries.size >= MAX_TRACKED_KEYS) entries.clear()
  }

  return {
    isBlocked(key) {
      const entry = entries.get(key)
      if (!entry) return false
      if (entry.resetAt <= now()) {
        entries.delete(key)
        return false
      }
      return entry.count >= options.max
    },
    recordFailure(key) {
      prune()
      const current = now()
      const entry = entries.get(key)
      if (!entry || entry.resetAt <= current) {
        entries.set(key, { count: 1, resetAt: current + options.windowMs })
        return
      }
      entry.count += 1
    },
  }
}
