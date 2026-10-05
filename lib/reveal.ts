import { Phase } from './types'

/** Scan that slows down toward the winning block, then the hold on it (StyleGuide Motion). */
export const LAND_MS = 2400
export const HOLD_MS = 3600
/** How long the page waits for the settled round to load before it drops the animation. */
export const AWAIT_MAX_MS = 15_000

const HOPS = 18
const BLOCKS = 25

export type SeenRound = {
  roundId: bigint
  phase: number
  hasEntries: boolean
}

/**
 * The round to animate, or null. The keeper chains settle and the start of the next round in one
 * call, so the page often sees the round id jump. A reveal needs a round the page saw live (it
 * had entries and was not final yet): a page opened after the fact, or an empty round, gets none.
 */
export function revealTarget(
  previous: SeenRound | null,
  now: { roundId: bigint; phase: number },
): bigint | null {
  if (!previous || !previous.hasEntries) {
    return null
  }
  const live =
    previous.phase === Phase.OPEN ||
    previous.phase === Phase.LOCKED ||
    previous.phase === Phase.RANDOMNESS_PENDING
  if (!live) {
    return null
  }
  if (now.roundId > previous.roundId) {
    return previous.roundId
  }
  if (now.roundId === previous.roundId && now.phase === Phase.SETTLED) {
    return previous.roundId
  }
  return null
}

export type Hop = { index: number; delayMs: number }

/**
 * Hops of the landing scan, 0-based block indexes. Like the prototype: random hops that slow down,
 * the last one is the winning block, and no hop repeats the previous block.
 */
export function landingHops(winIndex: number, random: () => number = Math.random): Hop[] {
  const hops: Hop[] = []
  let previous = -1
  for (let h = 0; h < HOPS; h += 1) {
    let index = h === HOPS - 1 ? winIndex : Math.floor(random() * BLOCKS)
    if (index === previous) {
      index = (index + 6) % BLOCKS
    }
    // The block before the landing must not be the winner, or the last hop would not move.
    if (h === HOPS - 2 && index === winIndex) {
      index = (index + 6) % BLOCKS
    }
    previous = index
    hops.push({ index, delayMs: (LAND_MS / HOPS) * (0.4 + 1.6 * (h / HOPS) ** 2) })
  }
  return hops
}
