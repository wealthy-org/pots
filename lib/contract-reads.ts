import type { usePublicClient } from 'wagmi'
import {
  entryPlacedEvent,
  jackpotPaidEvent,
  refundClaimedEvent,
  rewardClaimedEvent,
  roundSettledEvent,
} from './contract-events'
import { mapWithLimit, splitBlockRanges, type BlockRange } from './block-ranges'
import { managerAddress, managerDeployBlock, roundManagerAbi } from './contracts'
import type { ProtocolStatsView, WalletRoundRow } from './indexer'

export type ReadClient = NonNullable<ReturnType<typeof usePublicClient>>

export type ContractRead<T> = { value: T; block: bigint }

const SCAN_CONCURRENCY = 4

/** Scans from the deploy block to `head` in ranges that free public RPCs accept. */
export async function collectLogs<T>(
  head: bigint,
  fetchRange: (range: BlockRange) => Promise<T[]>,
): Promise<T[]> {
  const pages = await mapWithLimit(
    splitBlockRanges(managerDeployBlock, head),
    SCAN_CONCURRENCY,
    fetchRange,
  )
  return pages.flat()
}

export async function readCurrentRoundId(client: ReadClient): Promise<bigint> {
  return (await client.readContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'currentRoundId',
  })) as bigint
}

export async function readWalletHistoryFromContract(
  client: ReadClient,
  wallet: `0x${string}`,
): Promise<ContractRead<WalletRoundRow[]>> {
  const head = await client.getBlockNumber()
  const entries = await collectLogs(head, (range) =>
    client.getLogs({
      address: managerAddress,
      event: entryPlacedEvent,
      args: { wallet },
      ...range,
    }),
  )
  const rewards = await collectLogs(head, (range) =>
    client.getLogs({
      address: managerAddress,
      event: rewardClaimedEvent,
      args: { wallet },
      ...range,
    }),
  )
  const refunds = await collectLogs(head, (range) =>
    client.getLogs({
      address: managerAddress,
      event: refundClaimedEvent,
      args: { wallet },
      ...range,
    }),
  )
  const settled = await collectLogs(head, (range) =>
    client.getLogs({ address: managerAddress, event: roundSettledEvent, ...range }),
  )

  const winningByRound = new Map<string, number>()
  for (const log of settled) {
    if (log.args.roundId !== undefined && log.args.winningSquare !== undefined) {
      winningByRound.set(log.args.roundId.toString(), Number(log.args.winningSquare))
    }
  }

  const rows = new Map<string, WalletRoundRow>()
  const ensure = (roundId: bigint): WalletRoundRow => {
    const key = roundId.toString()
    const existing = rows.get(key)
    if (existing) {
      return existing
    }
    const row: WalletRoundRow = {
      roundId,
      deposited: 0n,
      claimedEth: 0n,
      claimedPots: 0n,
      winningSquare: winningByRound.get(key) ?? null,
    }
    rows.set(key, row)
    return row
  }

  for (const log of entries) {
    if (log.args.roundId === undefined) continue
    ensure(log.args.roundId).deposited += log.args.total ?? 0n
  }
  for (const log of rewards) {
    if (log.args.roundId === undefined) continue
    const row = ensure(log.args.roundId)
    if (Number(log.args.kind) === 0) {
      row.claimedEth += log.args.amount ?? 0n
    } else {
      row.claimedPots += log.args.amount ?? 0n
    }
  }
  for (const log of refunds) {
    if (log.args.roundId === undefined) continue
    ensure(log.args.roundId).claimedEth += log.args.amount ?? 0n
  }

  const sorted = Array.from(rows.values()).sort((a, b) => (a.roundId > b.roundId ? -1 : 1))
  return { value: sorted, block: head }
}

export async function readProtocolStatsFromContract(
  client: ReadClient,
): Promise<ContractRead<ProtocolStatsView>> {
  const head = await client.getBlockNumber()
  const entries = await collectLogs(head, (range) =>
    client.getLogs({ address: managerAddress, event: entryPlacedEvent, ...range }),
  )
  const settled = await collectLogs(head, (range) =>
    client.getLogs({ address: managerAddress, event: roundSettledEvent, ...range }),
  )
  const jackpots = await collectLogs(head, (range) =>
    client.getLogs({ address: managerAddress, event: jackpotPaidEvent, ...range }),
  )

  const wallets = new Set(entries.map((log) => log.args.wallet?.toLowerCase()).filter(Boolean))
  return {
    value: {
      totalCommitted: entries.reduce((sum, log) => sum + (log.args.total ?? 0n), 0n),
      rounds: settled.length,
      distributed: settled.reduce((sum, log) => sum + (log.args.pool ?? 0n), 0n),
      jackpotPaid: jackpots.reduce((sum, log) => sum + (log.args.amount ?? 0n), 0n),
      uniqueWallets: wallets.size,
    },
    block: head,
  }
}
