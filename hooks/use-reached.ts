'use client'

import { useEffect, useState } from 'react'

const MAX_TIMEOUT_MS = 2_000_000_000

/**
 * True once the unix timestamp (seconds) has passed. One timer fires at the moment it flips, so
 * the page does not re-render for a countdown. A target further away than a timer can wait is
 * rescheduled when the first timer fires.
 */
export function useReached(timestamp?: bigint): boolean {
  const target = timestamp && timestamp > 0n ? Number(timestamp) * 1000 : undefined
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (target === undefined) {
      return
    }
    const wait = target - Date.now()
    if (wait <= 0) {
      return
    }
    const timer = setTimeout(() => setNow(Date.now()), Math.min(wait, MAX_TIMEOUT_MS) + 50)
    return () => clearTimeout(timer)
  }, [target, now])

  return target !== undefined && now >= target
}
