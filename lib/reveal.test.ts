import { describe, expect, it } from 'vitest'
import { LAND_MS, landingHops, revealTarget } from './reveal'
import { Phase } from './types'

const seen = (roundId: bigint, phase: number, hasEntries = true) => ({ roundId, phase, hasEntries })

describe('revealTarget', () => {
  it('animates the round that was live when the id jumps', () => {
    expect(revealTarget(seen(7n, Phase.RANDOMNESS_PENDING), { roundId: 8n, phase: 1 })).toBe(7n)
    expect(revealTarget(seen(7n, Phase.LOCKED), { roundId: 8n, phase: 1 })).toBe(7n)
    expect(revealTarget(seen(7n, Phase.OPEN), { roundId: 8n, phase: 1 })).toBe(7n)
  })

  it('animates a round that settles under the page without an id change', () => {
    expect(
      revealTarget(seen(7n, Phase.RANDOMNESS_PENDING), { roundId: 7n, phase: Phase.SETTLED }),
    ).toBe(7n)
  })

  it('does nothing for a first observation, an empty round, or a finished round', () => {
    expect(revealTarget(null, { roundId: 8n, phase: 1 })).toBeNull()
    expect(revealTarget(seen(7n, Phase.OPEN, false), { roundId: 8n, phase: 1 })).toBeNull()
    expect(revealTarget(seen(7n, Phase.SETTLED), { roundId: 8n, phase: 1 })).toBeNull()
    expect(revealTarget(seen(7n, Phase.CANCELLED), { roundId: 8n, phase: 1 })).toBeNull()
  })

  it('does nothing while the same round moves forward without settling', () => {
    expect(revealTarget(seen(7n, Phase.OPEN), { roundId: 7n, phase: Phase.LOCKED })).toBeNull()
    expect(
      revealTarget(seen(7n, Phase.RANDOMNESS_PENDING), {
        roundId: 7n,
        phase: Phase.RANDOMNESS_PENDING,
      }),
    ).toBeNull()
  })

  it('does not go backwards', () => {
    expect(revealTarget(seen(7n, Phase.OPEN), { roundId: 6n, phase: Phase.SETTLED })).toBeNull()
  })
})

describe('landingHops', () => {
  function seeded(seed: number) {
    let state = seed
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296
      return state / 4294967296
    }
  }

  it('always lands on the winning block, for every block and several seeds', () => {
    for (let win = 0; win < 25; win += 1) {
      for (const seed of [1, 7, 99, 12345]) {
        const hops = landingHops(win, seeded(seed))
        expect(hops).toHaveLength(18)
        expect(hops.at(-1)?.index).toBe(win)
      }
    }
  })

  it('never repeats a block twice in a row and stays inside the grid', () => {
    for (let win = 0; win < 25; win += 1) {
      const hops = landingHops(win, seeded(win + 3))
      hops.forEach((hop, i) => {
        expect(hop.index).toBeGreaterThanOrEqual(0)
        expect(hop.index).toBeLessThan(25)
        if (i > 0) expect(hop.index).not.toBe(hops[i - 1].index)
      })
    }
  })

  it('slows down and stays near the scan duration', () => {
    const hops = landingHops(12, seeded(5))
    expect(hops.at(-1)!.delayMs).toBeGreaterThan(hops[0].delayMs * 3)
    const total = hops.reduce((sum, hop) => sum + hop.delayMs, 0)
    expect(total).toBeGreaterThan(LAND_MS * 0.8)
    expect(total).toBeLessThan(LAND_MS * 1.1)
  })
})
