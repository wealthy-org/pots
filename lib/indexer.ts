import { activeChain } from './chains'

export const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL ?? ''
export const indexerEnabled = indexerUrl !== '' && activeChain.id !== 31337

const REQUEST_TIMEOUT_MS = 8000
const RETRY_DELAYS_MS = [400, 1200]
export const HISTORY_ROW_LIMIT = 100
const STATS_ID = 'global'

/** Poll interval for views that scan contract events on a real chain, where each scan costs many RPC requests. */
export const CONTRACT_SCAN_INTERVAL_MS = 60000
export const INDEXER_POLL_INTERVAL_MS = 15000

/** Blocks the indexer may trail the chain head before reads fall back to the contract (testnet runs about 10 blocks per second). */
export const STALE_BLOCK_LAG = 600n

export type IndexerErrorKind = 'retry' | 'terminal'

export class IndexerError extends Error {
  readonly kind: IndexerErrorKind

  constructor(kind: IndexerErrorKind, message: string) {
    super(message)
    this.name = 'IndexerError'
    this.kind = kind
  }
}

export type WalletRoundRow = {
  roundId: bigint
  deposited: bigint
  claimedEth: bigint
  claimedPots: bigint
  winningSquare: number | null
}

export type ProtocolStatsView = {
  totalCommitted: bigint
  rounds: number
  distributed: bigint
  jackpotPaid: bigint
  uniqueWallets: number
}

export type IndexedResult<T> = T & {
  lastIndexedBlock: bigint
  indexerHead: bigint
  knownRoundIds: bigint[]
}

const WALLET_ROUNDS_QUERY = `
query WalletRounds($wallet: String!, $limit: Int!, $knownIds: [String!]!) {
  chain_metadata { block_height latest_processed_block }
  known: Round(where: { id: { _in: $knownIds } }) { id }
  WalletRound(where: { wallet: { _eq: $wallet } }, order_by: { roundId: desc }, limit: $limit) {
    roundId
    deposited
    ethClaimed
    refunded
    potsClaimed
  }
}`

const ROUND_WINNERS_QUERY = `
query RoundWinners($ids: [String!]!) {
  Round(where: { id: { _in: $ids } }) {
    id
    winningSquare
  }
}`

const PROTOCOL_STATS_QUERY = `
query ProtocolStats($id: String!, $knownIds: [String!]!) {
  chain_metadata { block_height latest_processed_block }
  known: Round(where: { id: { _in: $knownIds } }) { id }
  ProtocolStats_by_pk(id: $id) {
    totalEthCommitted
    roundsCompleted
    ethDistributed
    jackpotPaid
    uniqueWallets
  }
}`

export function isIndexerStale(lastIndexedBlock: bigint, chainHead: bigint): boolean {
  return chainHead - lastIndexedBlock > STALE_BLOCK_LAG
}

/** Round ids whose presence in the indexer shows it tracks the same contract as the app. */
export function roundIdsToCheck(currentRoundId: bigint | null): string[] {
  if (currentRoundId === null) {
    return []
  }
  const ids = [currentRoundId + 1n, currentRoundId]
  if (currentRoundId > 0n) {
    ids.push(currentRoundId - 1n)
  }
  return ids.map((id) => id.toString())
}

/**
 * The indexer must have seen the contract's current round (or the one before it while it catches
 * up) and must not hold rounds the contract has not opened.
 */
export function indexerKnowsCurrentRound(currentRoundId: bigint, knownRoundIds: bigint[]): boolean {
  if (knownRoundIds.includes(currentRoundId + 1n)) {
    return false
  }
  if (currentRoundId === 0n) {
    return true
  }
  return knownRoundIds.includes(currentRoundId) || knownRoundIds.includes(currentRoundId - 1n)
}

function terminal(message: string): IndexerError {
  return new IndexerError('terminal', message)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw terminal('The indexer returned an unexpected response shape.')
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value
  }
  throw terminal('The indexer returned an unexpected response shape.')
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value)
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value)
  }
  throw terminal('The indexer returned a number that cannot be read exactly.')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function postQuery(
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let payload: unknown
  try {
    const response = await fetch(indexerUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    })
    if (response.status === 429 || response.status >= 500) {
      throw new IndexerError('retry', `The indexer responded with status ${response.status}.`)
    }
    if (!response.ok) {
      throw terminal(`The indexer rejected the request with status ${response.status}.`)
    }
    payload = await response.json()
  } catch (error) {
    if (error instanceof IndexerError) {
      throw error
    }
    throw new IndexerError('retry', 'The indexer could not be reached.')
  } finally {
    clearTimeout(timer)
  }

  const body = asRecord(payload)
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw terminal('The indexer rejected the query.')
  }
  return asRecord(body.data)
}

export async function queryIndexer(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await postQuery(query, variables)
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt]
      if (!(error instanceof IndexerError) || error.kind === 'terminal' || delay === undefined) {
        throw error
      }
      await sleep(delay)
    }
  }
}

type ChainFreshness = Pick<IndexedResult<unknown>, 'lastIndexedBlock' | 'indexerHead'>

function readChainFreshness(data: Record<string, unknown>): ChainFreshness {
  const [first] = asArray(data.chain_metadata)
  if (first === undefined) {
    throw terminal('The indexer has not reported a processed block yet.')
  }
  const metadata = asRecord(first)
  return {
    lastIndexedBlock: toBigInt(metadata.latest_processed_block),
    indexerHead: toBigInt(metadata.block_height),
  }
}

function readKnownRoundIds(data: Record<string, unknown>): bigint[] {
  return asArray(data.known).map((round) => toBigInt(asRecord(round).id))
}

export async function fetchWalletHistory(
  wallet: string,
  currentRoundId: bigint | null,
): Promise<IndexedResult<{ rows: WalletRoundRow[] }>> {
  const data = await queryIndexer(WALLET_ROUNDS_QUERY, {
    wallet: wallet.toLowerCase(),
    limit: HISTORY_ROW_LIMIT,
    knownIds: roundIdsToCheck(currentRoundId),
  })
  const freshness = readChainFreshness(data)
  const knownRoundIds = readKnownRoundIds(data)
  const walletRounds = asArray(data.WalletRound).map(asRecord)

  const winners = new Map<string, number>()
  if (walletRounds.length > 0) {
    const ids = walletRounds.map((row) => toBigInt(row.roundId).toString())
    const roundData = await queryIndexer(ROUND_WINNERS_QUERY, { ids })
    for (const round of asArray(roundData.Round).map(asRecord)) {
      winners.set(String(round.id), Number(round.winningSquare))
    }
  }

  const rows = walletRounds.map((row): WalletRoundRow => {
    const roundId = toBigInt(row.roundId)
    const winningSquare = winners.get(roundId.toString()) ?? 0
    return {
      roundId,
      deposited: toBigInt(row.deposited),
      claimedEth: toBigInt(row.ethClaimed) + toBigInt(row.refunded),
      claimedPots: toBigInt(row.potsClaimed),
      winningSquare: winningSquare > 0 ? winningSquare : null,
    }
  })
  return { rows, ...freshness, knownRoundIds }
}

export async function fetchProtocolStats(
  currentRoundId: bigint | null,
): Promise<IndexedResult<{ stats: ProtocolStatsView }>> {
  const data = await queryIndexer(PROTOCOL_STATS_QUERY, {
    id: STATS_ID,
    knownIds: roundIdsToCheck(currentRoundId),
  })
  const freshness = readChainFreshness(data)
  const knownRoundIds = readKnownRoundIds(data)
  const row = data.ProtocolStats_by_pk
  if (row === null || row === undefined) {
    return {
      stats: { totalCommitted: 0n, rounds: 0, distributed: 0n, jackpotPaid: 0n, uniqueWallets: 0 },
      ...freshness,
      knownRoundIds,
    }
  }
  const record = asRecord(row)
  return {
    stats: {
      totalCommitted: toBigInt(record.totalEthCommitted),
      rounds: Number(toBigInt(record.roundsCompleted)),
      distributed: toBigInt(record.ethDistributed),
      jackpotPaid: toBigInt(record.jackpotPaid),
      uniqueWallets: Number(toBigInt(record.uniqueWallets)),
    },
    ...freshness,
    knownRoundIds,
  }
}

const MINER_ROW_CAP = 1000

const ROUND_MINERS_QUERY = `
query RoundMiners($roundId: numeric!) {
  SquareRound(where: { roundId: { _eq: $roundId } }) { squareId totalEth minerCount }
  SquareMiner(where: { roundId: { _eq: $roundId } }, limit: 1001) { wallet }
}`

export type RoundMiners = {
  /** Index 0 is block 1. `total` lets the caller drop a count that trails the chain. */
  perBlock: Array<{ total: bigint; miners: number } | null>
  /** Distinct wallets with ETH on at least one block of the round; null when the row cap may have cut the list. */
  miners: number | null
}

export async function fetchRoundMiners(roundId: bigint): Promise<RoundMiners> {
  const data = await queryIndexer(ROUND_MINERS_QUERY, { roundId: roundId.toString() })
  const perBlock: RoundMiners['perBlock'] = Array.from({ length: 25 }, () => null)
  for (const row of asArray(data.SquareRound).map(asRecord)) {
    const square = Number(row.squareId)
    if (square >= 1 && square <= 25) {
      perBlock[square - 1] = { total: toBigInt(row.totalEth), miners: Number(row.minerCount) }
    }
  }
  const rows = asArray(data.SquareMiner)
  const wallets = new Set(rows.map((row) => String(asRecord(row).wallet)))
  // One row per wallet and block: a list at the server's row cap may be cut, so no count is shown.
  return { perBlock, miners: rows.length >= MINER_ROW_CAP ? null : wallets.size }
}

const LAST_JACKPOT_QUERY = `
query LastJackpot {
  Round(where: { jackpotHit: { _eq: true } }, order_by: { settledAt: desc }, limit: 1) { id }
}`

/** Round id of the latest jackpot hit, or null when none happened. Ordered by settlement time, never by the string id. */
export async function fetchLastJackpotRound(): Promise<bigint | null> {
  const data = await queryIndexer(LAST_JACKPOT_QUERY)
  const [first] = asArray(data.Round)
  return first === undefined ? null : toBigInt(asRecord(first).id)
}
