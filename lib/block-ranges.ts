/** Largest block range a free public RPC accepts for eth_getLogs (the strictest tested limit is 10,000). */
export const MAX_LOG_RANGE = 9000n

export type BlockRange = { fromBlock: bigint; toBlock: bigint }

export function splitBlockRanges(
  from: bigint,
  to: bigint,
  size: bigint = MAX_LOG_RANGE,
): BlockRange[] {
  const ranges: BlockRange[] = []
  for (let start = from; start <= to; start += size) {
    const end = start + size - 1n
    ranges.push({ fromBlock: start, toBlock: end < to ? end : to })
  }
  return ranges
}

/** Runs `task` over `items` with at most `limit` in flight and returns results in input order. */
export async function mapWithLimit<I, O>(
  items: I[],
  limit: number,
  task: (item: I) => Promise<O>,
): Promise<O[]> {
  const results = new Array<O>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await task(items[index] as I)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
