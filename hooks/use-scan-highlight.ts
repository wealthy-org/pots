'use client'

import { useEffect, useState } from 'react'

const HOP_MS = 160

/**
 * Index of the block lit by the reveal scan while randomness is pending, like the prototype.
 * Returns null when idle and when the user asks for reduced motion (state changes stay instant).
 */
export function useScanHighlight(active: boolean, blocks = 25): number | null {
  const [index, setIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const timer = setInterval(() => {
      setIndex((previous) => {
        let next = Math.floor(Math.random() * blocks)
        if (next === previous) {
          next = (next + 6) % blocks
        }
        return next
      })
    }, HOP_MS)
    return () => {
      clearInterval(timer)
      setIndex(null)
    }
  }, [active, blocks])

  return active ? index : null
}
