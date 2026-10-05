import type { NavIconName } from '@/lib/nav'

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
} as const

export function NavIcon({
  name,
  className = 'h-4 w-4',
}: {
  name: NavIconName
  className?: string
}) {
  if (name === 'more') {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
        <circle cx="3.5" cy="8" r="1.3" />
        <circle cx="8" cy="8" r="1.3" />
        <circle cx="12.5" cy="8" r="1.3" />
      </svg>
    )
  }
  if (name === 'chat') {
    // The speech bubble of the prototype rail (mine.html).
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true" {...strokeProps}>
        <path d="M3 3.5h10a1 1 0 011 1v6a1 1 0 01-1 1H7l-3 2.5v-2.5H3a1 1 0 01-1-1v-6a1 1 0 011-1z" />
      </svg>
    )
  }
  if (name === 'fairness') {
    return (
      <svg
        viewBox="0 0 14 14"
        className={className}
        aria-hidden="true"
        {...strokeProps}
        strokeWidth={1.2}
      >
        <path d="M7 1.2l4.6 1.8v3.6c0 2.9-2 5-4.6 6.2C4.4 11.6 2.4 9.5 2.4 6.6V3L7 1.2z" />
        <path d="M5 7l1.4 1.4L9.2 5.6" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" {...strokeProps}>
      {name === 'mine' ? (
        <>
          <rect x="2" y="2" width="5" height="5" rx="1" />
          <rect x="9" y="2" width="5" height="5" rx="1" />
          <rect x="2" y="9" width="5" height="5" rx="1" />
          <rect x="9" y="9" width="5" height="5" rx="1" />
        </>
      ) : null}
      {name === 'token' ? (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5v7M5.8 6h3.4a1.3 1.3 0 010 2.6H6.8a1.3 1.3 0 000 2.6h3.4" />
        </>
      ) : null}
      {name === 'stats' ? <path d="M2.5 13.5V8.5M8 13.5v-11M13.5 13.5V6" /> : null}
      {name === 'history' ? (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.8V8l2.2 1.4" />
        </>
      ) : null}
      {name === 'docs' ? (
        <>
          <path d="M4 2h6l3 3v9H4z" />
          <path d="M10 2v3h3M6 8.5h5M6 11h5" />
        </>
      ) : null}
      {name === 'contracts' ? <path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5" /> : null}
    </svg>
  )
}
