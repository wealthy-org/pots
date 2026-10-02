import type { DataSourceInfo, FallbackReason } from './data-source'
import { IndexerError, indexerKnowsCurrentRound, isIndexerStale } from './indexer'

export type FallbackState = { blocked: boolean }

export function createFallbackState(): FallbackState {
  return { blocked: false }
}

export type IndexerSnapshot<T> = {
  value: T
  lastIndexedBlock: bigint
  indexerHead: bigint
  knownRoundIds: bigint[]
}

export type FallbackDeps<T> = {
  enabled: boolean
  state: FallbackState
  readChainHead: () => Promise<bigint>
  readCurrentRoundId: () => Promise<bigint>
  readIndexer: (currentRoundId: bigint | null) => Promise<IndexerSnapshot<T>>
  readContract: () => Promise<{ value: T; block: bigint }>
  onTerminal?: (error: unknown) => void
}

export type FallbackResult<T> = { value: T; source: DataSourceInfo }

type IndexerOutcome<T> =
  { ok: true; result: FallbackResult<T> } | { ok: false; reason: FallbackReason | null }

async function attempt<V>(read: () => Promise<V>): Promise<V | null> {
  try {
    return await read()
  } catch {
    return null
  }
}

async function tryIndexer<T>(deps: FallbackDeps<T>): Promise<IndexerOutcome<T>> {
  if (!deps.enabled) {
    return { ok: false, reason: null }
  }
  if (deps.state.blocked) {
    return { ok: false, reason: 'invalid' }
  }

  try {
    const [currentRoundId, rpcHead] = await Promise.all([
      attempt(deps.readCurrentRoundId),
      attempt(deps.readChainHead),
    ])
    const snapshot = await deps.readIndexer(currentRoundId)
    if (isIndexerStale(snapshot.lastIndexedBlock, rpcHead ?? snapshot.indexerHead)) {
      return { ok: false, reason: 'stale' }
    }
    if (
      currentRoundId !== null &&
      !indexerKnowsCurrentRound(currentRoundId, snapshot.knownRoundIds)
    ) {
      return { ok: false, reason: 'mismatch' }
    }
    return {
      ok: true,
      result: {
        value: snapshot.value,
        source: { kind: 'indexer', block: snapshot.lastIndexedBlock, fallback: null },
      },
    }
  } catch (error) {
    if (error instanceof IndexerError && error.kind === 'retry') {
      return { ok: false, reason: 'unreachable' }
    }
    deps.state.blocked = true
    deps.onTerminal?.(error)
    return { ok: false, reason: 'invalid' }
  }
}

/**
 * Reads from the indexer when it is usable and falls back to the contract otherwise. A response the
 * app cannot parse disables the indexer for the rest of the session instead of retrying it.
 */
export async function readIndexerFirst<T>(deps: FallbackDeps<T>): Promise<FallbackResult<T>> {
  const outcome = await tryIndexer(deps)
  if (outcome.ok) {
    return outcome.result
  }
  const contract = await deps.readContract()
  return {
    value: contract.value,
    source: { kind: 'contract', block: contract.block, fallback: outcome.reason },
  }
}

export function warnIndexerDisabled(error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown indexer error.'
  console.warn('Indexer disabled for this session; reading the contract instead.', { message })
}
