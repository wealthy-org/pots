const SEGMENTS = 30

// Every lit segment glows, not only the last one (owner request 2026-10-05, SD-17).
const GLOW = 'shadow-[0_0_8px_1px_rgba(232,194,122,0.5)]'

/**
 * The 30 segment bar of the prototype. Decorative: the timer text carries the information. Every lit
 * segment glows. While randomness is pending the segments pulse to show that the reveal is in progress.
 */
export function SegmentTimer({
  remaining,
  windowSeconds,
  open,
  revealing,
}: {
  remaining: number
  windowSeconds?: number
  open: boolean
  revealing: boolean
}) {
  const lit =
    open && windowSeconds
      ? Math.min(SEGMENTS, Math.ceil((remaining / windowSeconds) * SEGMENTS))
      : 0

  return (
    <div aria-hidden="true" className="flex h-2 gap-[3px]">
      {Array.from({ length: SEGMENTS }, (_, index) => (
        <i
          key={index}
          className={`h-full flex-1 rounded-[1px] ${
            revealing
              ? `bg-gold-2/60 ${GLOW} motion-safe:animate-pulse`
              : index < lit
                ? `bg-gold-2/70 ${GLOW} ${index === lit - 1 ? 'bg-gold-1' : ''}`
                : 'bg-white/[0.07]'
          }`}
        />
      ))}
    </div>
  )
}
