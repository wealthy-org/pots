'use client'

import { useEffect, useState } from 'react'

export function useCountdown(closeAt?: bigint): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  if (!closeAt || closeAt === 0n) {
    return 0
  }
  return Math.max(0, Number(closeAt) - now)
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
