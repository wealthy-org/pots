import { describe, expect, it } from 'vitest'
import { mapWithLimit, MAX_LOG_RANGE, splitBlockRanges } from './block-ranges'

describe('splitBlockRanges', () => {
  it('returns one range when the span fits', () => {
    expect(splitBlockRanges(0n, 50n)).toEqual([{ fromBlock: 0n, toBlock: 50n }])
  })

  it('splits a long span without gaps or overlaps', () => {
    const ranges = splitBlockRanges(100n, 100n + 2n * MAX_LOG_RANGE + 5n)
    expect(ranges).toHaveLength(3)
    expect(ranges[0]?.fromBlock).toBe(100n)
    for (let i = 1; i < ranges.length; i += 1) {
      expect(ranges[i]?.fromBlock).toBe((ranges[i - 1]?.toBlock ?? 0n) + 1n)
    }
    expect(ranges.at(-1)?.toBlock).toBe(100n + 2n * MAX_LOG_RANGE + 5n)
    expect(ranges.every((range) => range.toBlock - range.fromBlock < MAX_LOG_RANGE)).toBe(true)
  })

  it('returns nothing when the end is before the start', () => {
    expect(splitBlockRanges(10n, 9n)).toEqual([])
  })

  it('handles a single block', () => {
    expect(splitBlockRanges(7n, 7n)).toEqual([{ fromBlock: 7n, toBlock: 7n }])
  })
})

describe('mapWithLimit', () => {
  it('keeps input order and never exceeds the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0
    const results = await mapWithLimit([5, 1, 4, 2, 3, 6], 2, async (value) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, value))
      inFlight -= 1
      return value * 10
    })
    expect(results).toEqual([50, 10, 40, 20, 30, 60])
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('handles an empty list', async () => {
    expect(await mapWithLimit([], 4, async (value: number) => value)).toEqual([])
  })

  it('rejects when a task fails', async () => {
    await expect(
      mapWithLimit([1, 2], 2, async (value) => {
        if (value === 2) throw new Error('rpc failed')
        return value
      }),
    ).rejects.toThrow('rpc failed')
  })
})
