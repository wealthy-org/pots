import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const URL = 'https://indexer.example/v1/graphql'

type IndexerModule = typeof import('./indexer')

async function loadIndexer(): Promise<IndexerModule> {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_INDEXER_URL', URL)
  return import('./indexer')
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const chainMetadata = [{ block_height: 520, latest_processed_block: 500 }]

describe('indexer client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('is enabled only when a URL is set outside the local chain', async () => {
    const mod = await loadIndexer()
    expect(mod.indexerEnabled).toBe(true)

    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_INDEXER_URL', '')
    const unset = await import('./indexer')
    expect(unset.indexerEnabled).toBe(false)

    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_INDEXER_URL', URL)
    vi.stubEnv('NEXT_PUBLIC_ROBINHOOD_CHAIN_ID', '31337')
    const local = await import('./indexer')
    expect(local.indexerEnabled).toBe(false)
  })

  it('reads wallet history with exact bigint values and adds refunds to claimed ETH', async () => {
    const mod = await loadIndexer()
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            chain_metadata: chainMetadata,
            known: [{ id: '12' }, { id: '11' }],
            WalletRound: [
              {
                roundId: '12',
                deposited: '1234567890123456789',
                ethClaimed: '1000000000000000000',
                refunded: '5',
                potsClaimed: '7000000000000000000',
              },
              {
                roundId: 11,
                deposited: '10',
                ethClaimed: '0',
                refunded: '0',
                potsClaimed: '0',
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            Round: [
              { id: '12', winningSquare: 9 },
              { id: '11', winningSquare: 0 },
            ],
          },
        }),
      )

    const result = await mod.fetchWalletHistory('0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD', 12n)

    expect(result.lastIndexedBlock).toBe(500n)
    expect(result.indexerHead).toBe(520n)
    expect(result.knownRoundIds).toEqual([12n, 11n])
    expect(result.rows).toEqual([
      {
        roundId: 12n,
        deposited: 1234567890123456789n,
        claimedEth: 1000000000000000005n,
        claimedPots: 7000000000000000000n,
        winningSquare: 9,
      },
      { roundId: 11n, deposited: 10n, claimedEth: 0n, claimedPots: 0n, winningSquare: null },
    ])
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(firstBody.variables.wallet).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
    expect(firstBody.variables.knownIds).toEqual(['13', '12', '11'])
  })

  it('skips the winner lookup when the wallet has no rounds', async () => {
    const mod = await loadIndexer()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { chain_metadata: chainMetadata, known: [], WalletRound: [] } }),
    )

    const result = await mod.fetchWalletHistory('0x0000000000000000000000000000000000000001', null)

    expect(result.rows).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.variables.knownIds).toEqual([])
  })

  it('returns zeroed stats when the singleton does not exist yet', async () => {
    const mod = await loadIndexer()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: { chain_metadata: chainMetadata, known: [], ProtocolStats_by_pk: null },
      }),
    )

    const result = await mod.fetchProtocolStats(0n)

    expect(result.lastIndexedBlock).toBe(500n)
    expect(result.stats.totalCommitted).toBe(0n)
    expect(result.stats.rounds).toBe(0)
  })

  it('maps protocol stats', async () => {
    const mod = await loadIndexer()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          chain_metadata: chainMetadata,
          known: [{ id: '3' }],
          ProtocolStats_by_pk: {
            totalEthCommitted: '900000000000000000001',
            roundsCompleted: '3',
            ethDistributed: '10',
            jackpotPaid: '2',
            uniqueWallets: '4',
          },
        },
      }),
    )

    const { stats, knownRoundIds } = await mod.fetchProtocolStats(3n)

    expect(knownRoundIds).toEqual([3n])
    expect(stats).toEqual({
      totalCommitted: 900000000000000000001n,
      rounds: 3,
      distributed: 10n,
      jackpotPaid: 2n,
      uniqueWallets: 4,
    })
  })

  it('rejects numbers that cannot be read exactly', async () => {
    const mod = await loadIndexer()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          chain_metadata: chainMetadata,
          known: [],
          ProtocolStats_by_pk: {
            totalEthCommitted: 1.2e21,
            roundsCompleted: '3',
            ethDistributed: '10',
            jackpotPaid: '2',
            uniqueWallets: '4',
          },
        },
      }),
    )

    await expect(mod.fetchProtocolStats(null)).rejects.toMatchObject({ kind: 'terminal' })
  })

  it('treats GraphQL errors as terminal without retrying', async () => {
    const mod = await loadIndexer()
    fetchMock.mockResolvedValueOnce(jsonResponse({ errors: [{ message: 'field not found' }] }))

    await expect(mod.queryIndexer('{ x }')).rejects.toMatchObject({ kind: 'terminal' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a missing chain metadata row as terminal', async () => {
    const mod = await loadIndexer()
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { chain_metadata: [], known: [] } }))

    await expect(mod.fetchProtocolStats(null)).rejects.toMatchObject({ kind: 'terminal' })
  })

  it('retries 5xx responses with backoff and then succeeds', async () => {
    vi.useFakeTimers()
    const mod = await loadIndexer()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }))

    const pending = mod.queryIndexer('{ x }')
    await vi.advanceTimersByTimeAsync(2000)

    await expect(pending).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('gives up after the retry budget and reports a retryable error', async () => {
    vi.useFakeTimers()
    const mod = await loadIndexer()
    fetchMock.mockResolvedValue(jsonResponse({}, 502))

    const pending = mod.queryIndexer('{ x }')
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'retry' })
    await vi.advanceTimersByTimeAsync(5000)

    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('reports network failures as retryable', async () => {
    vi.useFakeTimers()
    const mod = await loadIndexer()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const pending = mod.queryIndexer('{ x }')
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'retry' })
    await vi.advanceTimersByTimeAsync(5000)

    await assertion
  })

  it('does not retry client errors', async () => {
    const mod = await loadIndexer()
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 400))

    await expect(mod.queryIndexer('{ x }')).rejects.toMatchObject({ kind: 'terminal' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('isIndexerStale', () => {
  it('flags an indexer trailing the head by more than the allowed lag', async () => {
    const mod = await loadIndexer()
    expect(mod.isIndexerStale(1000n, 1000n)).toBe(false)
    expect(mod.isIndexerStale(1000n, 1000n + mod.STALE_BLOCK_LAG)).toBe(false)
    expect(mod.isIndexerStale(1000n, 1001n + mod.STALE_BLOCK_LAG)).toBe(true)
  })

  it('does not flag an indexer that is ahead of the RPC head', async () => {
    const mod = await loadIndexer()
    expect(mod.isIndexerStale(1005n, 1000n)).toBe(false)
  })
})

describe('round consistency', () => {
  it('lists the round ids that prove the indexer tracks the same contract', async () => {
    const mod = await loadIndexer()
    expect(mod.roundIdsToCheck(null)).toEqual([])
    expect(mod.roundIdsToCheck(0n)).toEqual(['1', '0'])
    expect(mod.roundIdsToCheck(5n)).toEqual(['6', '5', '4'])
  })

  it('accepts an indexer that knows the current round or trails by one', async () => {
    const mod = await loadIndexer()
    expect(mod.indexerKnowsCurrentRound(5n, [5n, 4n])).toBe(true)
    expect(mod.indexerKnowsCurrentRound(5n, [4n])).toBe(true)
    expect(mod.indexerKnowsCurrentRound(0n, [])).toBe(true)
  })

  it('rejects an indexer with no rounds, or rounds the contract has not opened', async () => {
    const mod = await loadIndexer()
    expect(mod.indexerKnowsCurrentRound(1n, [])).toBe(false)
    expect(mod.indexerKnowsCurrentRound(5n, [])).toBe(false)
    expect(mod.indexerKnowsCurrentRound(5n, [3n])).toBe(false)
    expect(mod.indexerKnowsCurrentRound(5n, [6n, 5n])).toBe(false)
    expect(mod.indexerKnowsCurrentRound(0n, [1n])).toBe(false)
  })
})
