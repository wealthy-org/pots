import { Phase } from './types'

/**
 * Whether a deploy can be sent now. A finished round, or no round yet, counts: the deploy starts
 * the next round itself (ADR-014). An open round whose countdown ended is closed even before the
 * keeper locks it (up to about a minute, L-113), and the contract would reject the deploy.
 */
export function canEnterPhase(
  phase: number | undefined,
  needsStart: boolean,
  roundClosed: boolean,
): boolean {
  if (roundClosed) {
    return false
  }
  return phase === undefined || phase === Phase.OPEN || phase === Phase.WAITING || needsStart
}
