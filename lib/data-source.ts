export type FallbackReason = 'stale' | 'unreachable' | 'invalid' | 'mismatch'

export type DataSourceInfo = {
  kind: 'indexer' | 'contract'
  block: bigint
  fallback: FallbackReason | null
}

const fallbackNotes: Record<FallbackReason, string> = {
  stale: 'The indexer is behind the chain, so this view was read from the contract.',
  unreachable: 'The indexer could not be reached, so this view was read from the contract.',
  invalid:
    'The indexer returned data this app cannot use, so this view was read from the contract.',
  mismatch:
    'The indexer does not match the current contract, so this view was read from the contract.',
}

export function describeDataSource(source: DataSourceInfo): { label: string; note: string | null } {
  const block = source.block.toString()
  if (source.kind === 'indexer') {
    return { label: `Source: indexer, last indexed block ${block}`, note: null }
  }
  return {
    label: `Source: contract events, read at block ${block}`,
    note: source.fallback ? fallbackNotes[source.fallback] : null,
  }
}
