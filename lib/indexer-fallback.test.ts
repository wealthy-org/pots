import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeDataSource } from './data-source'
import { createFallbackState, readIndexerFirst, type FallbackDeps } from './indexer-fallback'
import { IndexerError, STALE_BLOCK_LAG } from './indexer'

type Value = { label: string }

const indexerValue: Value = { label: 'indexer' }
const contractValue: Value = { label: 'contract' }

function makeDeps(overrides: Partial<FallbackDeps<Value>> = {}): FallbackDeps<Value> {
  return {
    enabled: true,
    state: createFallbackState(),
    readChainHead: async () => 1000n,
    readCurrentRoundId: async () => 5n,
    readIndexer: async () => ({
      value: indexerValue,
      lastIndexedBlock: 995n,
      indexerHead: 1000n,
      knownRoundIds: [5n, 4n],
    }),
    readContract: async () => ({ value: contractValue, block: 1001n }),
    ...overrides,
  }
}

describe('readIndexerFirst', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses a healthy indexer and reports its last indexed block', async () => {
    const result = await readIndexerFirst(makeDeps())
    expect(result.value).toBe(indexerValue)
    expect(result.source).toEqual({ kind: 'indexer', block: 995n, fallback: null })
  })

  it('reads the contract directly when the indexer is disabled', async () => {
    const readIndexer = vi.fn()
    const result = await readIndexerFirst(makeDeps({ enabled: false, readIndexer }))
    expect(readIndexer).not.toHaveBeenCalled()
    expect(result.value).toBe(contractValue)
    expect(result.source).toEqual({ kind: 'contract', block: 1001n, fallback: null })
  })

  it('falls back when the indexer trails the RPC head', async () => {
    const result = await readIndexerFirst(
      makeDeps({ readChainHead: async () => 995n + STALE_BLOCK_LAG + 1n }),
    )
    expect(result.value).toBe(contractValue)
    expect(result.source.fallback).toBe('stale')
  })

  it('falls back when the indexer does not know the current round', async () => {
    const result = await readIndexerFirst(
      makeDeps({
        readIndexer: async () => ({
          value: indexerValue,
          lastIndexedBlock: 999n,
          indexerHead: 1000n,
          knownRoundIds: [],
        }),
      }),
    )
    expect(result.value).toBe(contractValue)
    expect(result.source.fallback).toBe('mismatch')
  })

  it('keeps using the indexer when the RPC cannot answer, judging staleness by the indexer head', async () => {
    const result = await readIndexerFirst(
      makeDeps({
        readChainHead: async () => {
          throw new Error('429')
        },
        readCurrentRoundId: async () => {
          throw new Error('429')
        },
      }),
    )
    expect(result.value).toBe(indexerValue)
    expect(result.source.kind).toBe('indexer')
  })

  it('still flags a stale indexer by its own head when the RPC is down', async () => {
    const result = await readIndexerFirst(
      makeDeps({
        readChainHead: async () => {
          throw new Error('429')
        },
        readIndexer: async () => ({
          value: indexerValue,
          lastIndexedBlock: 100n,
          indexerHead: 100n + STALE_BLOCK_LAG + 1n,
          knownRoundIds: [5n],
        }),
      }),
    )
    expect(result.source.fallback).toBe('stale')
  })

  it('falls back as unreachable on retryable errors without disabling the indexer', async () => {
    const deps = makeDeps({
      readIndexer: async () => {
        throw new IndexerError('retry', 'down')
      },
    })
    const result = await readIndexerFirst(deps)
    expect(result.value).toBe(contractValue)
    expect(result.source.fallback).toBe('unreachable')
    expect(deps.state.blocked).toBe(false)
  })

  it('disables the indexer for the session after a terminal error and stops calling it', async () => {
    const readIndexer = vi.fn(async () => {
      throw new IndexerError('terminal', 'schema mismatch')
    })
    const onTerminal = vi.fn()
    const deps = makeDeps({ readIndexer, onTerminal })

    const first = await readIndexerFirst(deps)
    const second = await readIndexerFirst(deps)

    expect(first.source.fallback).toBe('invalid')
    expect(second.source.fallback).toBe('invalid')
    expect(second.value).toBe(contractValue)
    expect(readIndexer).toHaveBeenCalledTimes(1)
    expect(onTerminal).toHaveBeenCalledTimes(1)
  })

  it('treats an unexpected error as terminal so it is not retried silently', async () => {
    const deps = makeDeps({
      readIndexer: async () => {
        throw new TypeError('cannot read properties of undefined')
      },
    })
    const result = await readIndexerFirst(deps)
    expect(result.source.fallback).toBe('invalid')
    expect(deps.state.blocked).toBe(true)
  })

  it('propagates a contract read failure so the page can show its error state', async () => {
    const deps = makeDeps({
      enabled: false,
      readContract: async () => {
        throw new Error('rpc failed')
      },
    })
    await expect(readIndexerFirst(deps)).rejects.toThrow('rpc failed')
  })

  it('names each fallback reason in the data source note', () => {
    const notes = (['stale', 'unreachable', 'invalid', 'mismatch'] as const).map(
      (fallback) => describeDataSource({ kind: 'contract', block: 1n, fallback }).note,
    )
    expect(new Set(notes).size).toBe(4)
    expect(notes.every((note) => typeof note === 'string' && note.length > 0)).toBe(true)
  })
})
