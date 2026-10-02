import { describe, expect, it } from 'vitest'
import { describeDataSource } from './data-source'

describe('describeDataSource', () => {
  it('labels indexer data with the last indexed block and no warning', () => {
    expect(describeDataSource({ kind: 'indexer', block: 123n, fallback: null })).toEqual({
      label: 'Source: indexer, last indexed block 123',
      note: null,
    })
  })

  it('labels direct contract reads without a warning when the indexer is not in use', () => {
    expect(describeDataSource({ kind: 'contract', block: 9n, fallback: null })).toEqual({
      label: 'Source: contract events, read at block 9',
      note: null,
    })
  })

  it('explains why the contract was read instead of the indexer', () => {
    const stale = describeDataSource({ kind: 'contract', block: 9n, fallback: 'stale' })
    const unreachable = describeDataSource({ kind: 'contract', block: 9n, fallback: 'unreachable' })

    expect(stale.label).toBe('Source: contract events, read at block 9')
    expect(stale.note).toContain('behind')
    expect(unreachable.note).toContain('could not be reached')
  })
})
