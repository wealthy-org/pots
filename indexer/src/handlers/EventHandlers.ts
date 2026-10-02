import { indexer } from 'envio'

const STATS_ID = 'global'

const fields = { transaction: ['hash'], block: ['timestamp'] } as const

function defaultStats() {
  return {
    id: STATS_ID,
    totalEthCommitted: 0n,
    roundsCompleted: 0n,
    ethDistributed: 0n,
    potsEmitted: 0n,
    jackpotPaid: 0n,
    jackpotHits: 0n,
    uniqueWallets: 0n,
    lastIndexedBlock: 0n,
  }
}

indexer.onEvent(
  { contract: 'PotsRoundManager', event: 'RoundOpened', fields },
  async ({ event, context }) => {
    const id = event.params.roundId.toString()
    const existing = await context.Round.get(id)
    context.Round.set({
      id,
      phase: 'WAITING',
      openedAt: existing?.openedAt ?? 0n,
      closeAt: existing?.closeAt ?? 0n,
      settledAt: existing?.settledAt ?? 0n,
      totalEth: existing?.totalEth ?? 0n,
      winningSquare: existing?.winningSquare ?? 0,
      winningSquareEth: existing?.winningSquareEth ?? 0n,
      rolloverIn: event.params.rolloverIn,
      rolloverOut: existing?.rolloverOut ?? 0n,
      jackpotHit: existing?.jackpotHit ?? false,
      jackpotPaid: existing?.jackpotPaid ?? 0n,
      randomnessRequestId: existing?.randomnessRequestId ?? 0n,
      randomOutput: existing?.randomOutput ?? '',
      roundingDust: existing?.roundingDust ?? 0n,
      txHash: event.transaction.hash ?? '',
    })
  },
)

indexer.onEvent(
  { contract: 'PotsRoundManager', event: 'EntryPlaced', fields },
  async ({ event, context }) => {
    const roundId = event.params.roundId
    const roundKey = roundId.toString()
    const wallet = event.params.wallet.toLowerCase()
    const squares = event.params.squareIds.map((square) => Number(square))
    const amountPerSquare = event.params.amountPerSquare
    const total = event.params.total
    const txHash = event.transaction.hash ?? ''

    for (const squareId of squares) {
      context.Entry.set({
        id: `${txHash}-${event.logIndex}-${squareId}`,
        roundId,
        squareId,
        wallet,
        amount: amountPerSquare,
        blockNumber: BigInt(event.block.number),
        timestamp: BigInt(event.block.timestamp),
        txHash,
      })

      const squareKey = `${roundKey}-${squareId}`
      const squareRound = await context.SquareRound.get(squareKey)
      const minerId = `${roundKey}-${squareId}-${wallet}`
      const miner = await context.SquareMiner.get(minerId)
      let minerCount = squareRound?.minerCount ?? 0
      if (!miner) {
        context.SquareMiner.set({ id: minerId, roundId, squareId, wallet })
        minerCount += 1
      }
      context.SquareRound.set({
        id: squareKey,
        roundId,
        squareId,
        totalEth: (squareRound?.totalEth ?? 0n) + amountPerSquare,
        minerCount,
      })
    }

    const round = await context.Round.get(roundKey)
    if (round) {
      context.Round.set({
        ...round,
        phase: round.openedAt === 0n ? 'OPEN' : round.phase,
        openedAt: round.openedAt === 0n ? BigInt(event.block.timestamp) : round.openedAt,
        totalEth: round.totalEth + total,
      })
    }

    const walletKey = `${roundKey}-${wallet}`
    const walletRound = await context.WalletRound.get(walletKey)
    const deposited = (walletRound?.deposited ?? 0n) + total
    const ethClaimed = walletRound?.ethClaimed ?? 0n
    const refunded = walletRound?.refunded ?? 0n
    context.WalletRound.set({
      id: walletKey,
      roundId,
      wallet,
      deposited,
      ethWon: walletRound?.ethWon ?? 0n,
      potsWon: walletRound?.potsWon ?? 0n,
      jackpotWon: walletRound?.jackpotWon ?? 0n,
      ethClaimed,
      potsClaimed: walletRound?.potsClaimed ?? 0n,
      refunded,
      netEth: ethClaimed + refunded - deposited,
      claimTxHashes: walletRound?.claimTxHashes ?? [],
    })

    const walletEntity = await context.Wallet.get(wallet)
    if (!walletEntity) {
      context.Wallet.set({ id: wallet })
    }

    const stats = (await context.ProtocolStats.get(STATS_ID)) ?? defaultStats()
    context.ProtocolStats.set({
      ...stats,
      totalEthCommitted: stats.totalEthCommitted + total,
      uniqueWallets: stats.uniqueWallets + (walletEntity ? 0n : 1n),
      lastIndexedBlock: BigInt(event.block.number),
    })
  },
)

indexer.onEvent(
  { contract: 'PotsRoundManager', event: 'RoundLocked', fields },
  async ({ event, context }) => {
    const id = event.params.roundId.toString()
    const round = await context.Round.get(id)
    if (round) {
      context.Round.set({ ...round, phase: 'LOCKED', closeAt: event.params.closeAt })
    }
  },
)

indexer.onEvent(
  { contract: 'PotsRoundManager', event: 'RandomnessRequested', fields },
  async ({ event, context }) => {
    const roundId = event.params.roundId
    const round = await context.Round.get(roundId.toString())
    if (round) {
      context.Round.set({
        ...round,
        phase: 'RANDOMNESS_PENDING',
        randomnessRequestId: event.params.sequence,
      })
    }
    context.RandomnessRequest.set({
      id: event.params.sequence.toString(),
      roundId,
      requestedBlock: BigInt(event.block.number),
      fulfilledBlock: 0n,
      output: '',
      refunded: false,
    })
  },
)

indexer.onEvent(
  { contract: 'PotsRoundManager', event: 'RandomnessFulfilled', fields },
  async ({ event, context }) => {
    const round = await context.Round.get(event.params.roundId.toString())
    if (round) {
      context.Round.set({ ...round, randomOutput: event.params.output })
    }
    const request = await context.RandomnessRequest.get(event.params.sequence.toString())
    if (request) {
      context.RandomnessRequest.set({
        ...request,
        fulfilledBlock: BigInt(event.block.number),
        output: event.params.output,
      })
    }
  },
)

indexer.onEvent(
  { contract: 'PotsRoundManager', event: 'RandomnessRefunded', fields },
  async ({ event, context }) => {
    const request = await context.RandomnessRequest.get(event.params.sequence.toString())
    if (request) {
      context.RandomnessRequest.set({ ...request, refunded: true })
    }
  },
)

indexer.onEvent(
  { contract: 'PotsRoundManager', event: 'RoundSettled', fields },
  async ({ event, context }) => {
    const id = event.params.roundId.toString()
    const round = await context.Round.get(id)
    if (round) {
      context.Round.set({
        ...round,
        phase: 'SETTLED',
        winningSquare: Number(event.params.winningSquare),
        winningSquareEth: event.params.winningSquareEth,
        rolloverOut: event.params.rolloverOut,
        jackpotHit: event.params.jackpotHit,
        settledAt: BigInt(event.block.timestamp),
      })
    }
    const stats = (await context.ProtocolStats.get(STATS_ID)) ?? defaultStats()
    context.ProtocolStats.set({
      ...stats,
      roundsCompleted: stats.roundsCompleted + 1n,
      ethDistributed: stats.ethDistributed + event.params.pool,
      lastIndexedBlock: BigInt(event.block.number),
    })
  },
)

indexer.onEvent(
  { contract: 'PotsRoundManager', event: 'RewardAllocated', fields },
  async ({ event, context }) => {
    const walletKey = `${event.params.roundId.toString()}-${event.params.wallet.toLowerCase()}`
    const walletRound = await context.WalletRound.get(walletKey)
    if (walletRound) {
      context.WalletRound.set({
        ...walletRound,
        ethWon: walletRound.ethWon + event.params.eth,
        potsWon: walletRound.potsWon + event.params.pots,
      })
    }
  },
)

indexer.onEvent(
  { contract: 'PotsRoundManager', event: 'RewardClaimed', fields },
  async ({ event, context }) => {
    const roundId = event.params.roundId
    const wallet = event.params.wallet.toLowerCase()
    const kind = Number(event.params.kind)
    const amount = event.params.amount
    const txHash = event.transaction.hash ?? ''

    const walletKey = `${roundId.toString()}-${wallet}`
    const walletRound = await context.WalletRound.get(walletKey)
    const ethClaimed =
      kind === 0 ? (walletRound?.ethClaimed ?? 0n) + amount : (walletRound?.ethClaimed ?? 0n)
    const potsClaimed =
      kind === 1 ? (walletRound?.potsClaimed ?? 0n) + amount : (walletRound?.potsClaimed ?? 0n)
    const deposited = walletRound?.deposited ?? 0n
    const refunded = walletRound?.refunded ?? 0n
    context.WalletRound.set({
      id: walletKey,
      roundId,
      wallet,
      deposited,
      ethWon: walletRound?.ethWon ?? 0n,
      potsWon: walletRound?.potsWon ?? 0n,
      jackpotWon: walletRound?.jackpotWon ?? 0n,
      ethClaimed,
      potsClaimed,
      refunded,
      netEth: ethClaimed + refunded - deposited,
      claimTxHashes: [...(walletRound?.claimTxHashes ?? []), txHash],
    })

    context.Claim.set({
      id: `${txHash}-${event.logIndex}`,
      roundId,
      wallet,
      kind: kind === 0 ? 'ETH_REWARD' : 'POTS_REWARD',
      amount,
      txHash,
      timestamp: BigInt(event.block.timestamp),
    })

    if (kind === 1) {
      const stats = (await context.ProtocolStats.get(STATS_ID)) ?? defaultStats()
      context.ProtocolStats.set({
        ...stats,
        potsEmitted: stats.potsEmitted + amount,
        lastIndexedBlock: BigInt(event.block.number),
      })
    }
  },
)

indexer.onEvent(
  { contract: 'PotsRoundManager', event: 'RefundClaimed', fields },
  async ({ event, context }) => {
    const roundId = event.params.roundId
    const wallet = event.params.wallet.toLowerCase()
    const amount = event.params.amount
    const txHash = event.transaction.hash ?? ''

    const walletKey = `${roundId.toString()}-${wallet}`
    const walletRound = await context.WalletRound.get(walletKey)
    const deposited = walletRound?.deposited ?? 0n
    const ethClaimed = walletRound?.ethClaimed ?? 0n
    const refunded = (walletRound?.refunded ?? 0n) + amount
    context.WalletRound.set({
      id: walletKey,
      roundId,
      wallet,
      deposited,
      ethWon: walletRound?.ethWon ?? 0n,
      potsWon: walletRound?.potsWon ?? 0n,
      jackpotWon: walletRound?.jackpotWon ?? 0n,
      ethClaimed,
      potsClaimed: walletRound?.potsClaimed ?? 0n,
      refunded,
      netEth: ethClaimed + refunded - deposited,
      claimTxHashes: [...(walletRound?.claimTxHashes ?? []), txHash],
    })

    context.Claim.set({
      id: `${txHash}-${event.logIndex}`,
      roundId,
      wallet,
      kind: 'REFUND',
      amount,
      txHash,
      timestamp: BigInt(event.block.timestamp),
    })
  },
)

indexer.onEvent(
  { contract: 'PotsRoundManager', event: 'JackpotPaid', fields },
  async ({ event, context }) => {
    const id = event.params.roundId.toString()
    const round = await context.Round.get(id)
    if (round) {
      context.Round.set({ ...round, jackpotPaid: event.params.amount })
    }
    const stats = (await context.ProtocolStats.get(STATS_ID)) ?? defaultStats()
    context.ProtocolStats.set({
      ...stats,
      jackpotPaid: stats.jackpotPaid + event.params.amount,
      jackpotHits: stats.jackpotHits + 1n,
      lastIndexedBlock: BigInt(event.block.number),
    })
  },
)

indexer.onEvent(
  { contract: 'PotsRoundManager', event: 'RoundCancelled', fields },
  async ({ event, context }) => {
    const id = event.params.roundId.toString()
    const round = await context.Round.get(id)
    if (round) {
      context.Round.set({ ...round, phase: 'CANCELLED' })
    }
  },
)
