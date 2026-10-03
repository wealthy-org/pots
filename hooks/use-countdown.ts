'use client'

import { useEffect, useState } from 'react'

/** Seconds left until a unix timestamp. It ticks only while there is a target to count down to. */
export function useCountdown(closeAt?: bigint): number {
  const [now, setNow] = useState(() => Date.now())
  const active = Boolean(closeAt && closeAt > 0n)

  useEffect(() => {
    if (!active) {
      return
    }
    // Resync at once so the first frame for a new target does not show a stale second.
    const first = setTimeout(() => setNow(Date.now()), 0)
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [active, closeAt])

  if (!closeAt || closeAt === 0n) {
    return 0
  }
  return Math.max(0, Number(closeAt) - Math.floor(now / 1000))
}

export function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export function formatRemaining(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${String(minutes).padStart(2, '0')}m`
  }
  return formatCountdown(seconds)
}
