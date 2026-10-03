'use client'

import { useId } from 'react'

/** Small ETH and POTS marks from the prototype sprite. They are data labels, not decoration. */
export function EthMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="#23252c" />
      <path d="M8 2.6l3.2 5.3L8 9.8 4.8 7.9 8 2.6z" fill="#d6d9e0" />
      <path d="M8 10.5l3.2-1.9L8 13.4 4.8 8.6 8 10.5z" fill="#8f929b" />
    </svg>
  )
}

export function PotsMark({ className = 'h-4 w-4' }: { className?: string }) {
  // One gradient id per instance: a duplicated id breaks when the first copy is display:none.
  const gradientId = useId()
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f7e2ad" />
          <stop offset=".6" stopColor="#e6bd6c" />
          <stop offset="1" stopColor="#b98838" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="14" height="14" rx="4" fill={`url(#${gradientId})`} />
      <g fill="#1a1307">
        <rect x="4" y="4" width="3" height="3" rx=".7" />
        <rect x="9" y="4" width="3" height="3" rx=".7" opacity=".45" />
        <rect x="4" y="9" width="3" height="3" rx=".7" opacity=".45" />
        <rect x="9" y="9" width="3" height="3" rx=".7" />
      </g>
    </svg>
  )
}
