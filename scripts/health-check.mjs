import { readFileSync } from 'node:fs'
import { createPublicClient, formatEther, http } from 'viem'

const managerAbi = JSON.parse(
  readFileSync(new URL('../contracts/abi/PotsRoundManager.json', import.meta.url), 'utf8'),
)
const adapterAbi = JSON.parse(
  readFileSync(new URL('../contracts/abi/PotsRandomnessAdapter.json', import.meta.url), 'utf8'),
)

const rpcUrl =
  process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ?? 'https://robinhood-sepolia-rpc.publicnode.com'
const managerAddress = process.env.NEXT_PUBLIC_ROUND_MANAGER_ADDRESS
const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL

const INDEXER_WARN_LAG = 600n
const INDEXER_FAIL_LAG = 6000n
const HEAD_AGE_WARN_S = 120
const OPEN_PAST_DEADLINE_WARN_S = 120
const LOCKED_WARN_S = 120
const LOCKED_FAIL_S = 600
const PENDING_WARN_S = 120
const PENDING_FAIL_S = 600

const phaseNames = [
  'NONE',
  'WAITING',
  'OPEN',
  'LOCKED',
  'RANDOMNESS_PENDING',
  'SETTLED',
  'CANCELLED',
]

const results = []

function report(level, check, detail) {
  results.push({ level, check, detail })
  console.log(`${level.padEnd(4)} ${check}: ${detail}`)
}

async function checkIndexer(client, head, currentRoundId) {
  if (!indexerUrl) {
    report('SKIP', 'indexer', 'NEXT_PUBLIC_INDEXER_URL is not set')
    return
  }
  const knownIds = [currentRoundId + 1n, currentRoundId, currentRoundId - 1n]
    .filter((id) => id >= 0n)
    .map((id) => id.toString())
  const query = `query($ids: [String!]!) {
    chain_metadata { block_height latest_processed_block }
    known: Round(where: { id: { _in: $ids } }) { id }
  }`
  let body
  try {
    const response = await fetch(indexerUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables: { ids: knownIds } }),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      report('FAIL', 'indexer', `endpoint answered HTTP ${response.status}`)
      return
    }
    body = await response.json()
  } catch (error) {
    report('FAIL', 'indexer', `endpoint unreachable (${error.message})`)
    return
  }
  const metadata = body?.data?.chain_metadata?.[0]
  if (!metadata) {
    report('FAIL', 'indexer', 'no chain metadata in the response')
    return
  }
  const processed = BigInt(metadata.latest_processed_block)
  const lag = head - processed
  const lagText = `processed block ${processed}, chain head ${head}, lag ${lag} blocks`
  if (lag > INDEXER_FAIL_LAG) report('FAIL', 'indexer lag', lagText)
  else if (lag > INDEXER_WARN_LAG) report('WARN', 'indexer lag', lagText)
  else report('OK', 'indexer lag', lagText)

  const known = (body.data.known ?? []).map((round) => BigInt(round.id))
  if (currentRoundId === 0n) {
    report(
      known.length === 0 ? 'OK' : 'WARN',
      'indexer rounds',
      `contract has no round yet; indexer knows ${known.length}`,
    )
  } else if (known.includes(currentRoundId + 1n)) {
    report(
      'FAIL',
      'indexer rounds',
      'indexer holds a round the contract has not opened (wrong contract?)',
    )
  } else if (known.includes(currentRoundId) || known.includes(currentRoundId - 1n)) {
    report('OK', 'indexer rounds', `indexer knows round ${currentRoundId} or the one before it`)
  } else {
    report(
      'FAIL',
      'indexer rounds',
      `indexer does not know round ${currentRoundId} (wrong contract or config?)`,
    )
  }
}

async function checkContract(client, now) {
  const read = (functionName, args = []) =>
    client.readContract({ address: managerAddress, abi: managerAbi, functionName, args })

  const [
    currentRoundId,
    paused,
    accounting,
    balance,
    adapterAddress,
    lockedCancelDelay,
    forceCancelDelay,
  ] = await Promise.all([
    read('currentRoundId'),
    read('paused'),
    read('accounting'),
    client.getBalance({ address: managerAddress }),
    read('adapter'),
    read('lockedCancelDelay'),
    read('forceCancelDelay'),
  ])
  report(
    paused ? 'WARN' : 'OK',
    'paused',
    paused ? 'new entries are paused (claims stay open)' : 'not paused',
  )

  const [unsettled, unclaimed, rollover, jackpot, treasury, dust] = accounting
  const accounted = unsettled + unclaimed + rollover + jackpot + treasury + dust
  if (balance < accounted) {
    report(
      'FAIL',
      'eth invariant',
      `balance ${formatEther(balance)} is below accounted ${formatEther(accounted)}`,
    )
  } else if (balance > accounted) {
    report(
      'WARN',
      'eth invariant',
      `surplus ${formatEther(balance - accounted)} ETH (forced or stray ETH); funds are covered`,
    )
  } else {
    report('OK', 'eth invariant', `balance equals accounted funds (${formatEther(balance)} ETH)`)
  }

  try {
    const fee = await client.readContract({
      address: adapterAddress,
      abi: adapterAbi,
      functionName: 'quoteFee',
    })
    report(
      treasury >= fee ? 'OK' : 'FAIL',
      'treasury',
      `${formatEther(treasury)} ETH, next randomness fee ${formatEther(fee)} ETH${treasury >= fee ? '' : ' (requestRandomness would revert; fund the treasury)'}`,
    )
  } catch (error) {
    report(
      'FAIL',
      'treasury',
      `randomness fee could not be quoted (${error.shortMessage ?? error.message})`,
    )
  }

  if (currentRoundId === 0n) {
    report('WARN', 'round', 'no round has been started; call startNextRound()')
    return currentRoundId
  }

  const round = await read('getRound', [currentRoundId])
  const phase = Number(round.phase)
  const phaseName = phaseNames[phase] ?? `UNKNOWN(${phase})`
  const prefix = `round ${currentRoundId} ${phaseName}`

  if (phase === 2) {
    const late = now - Number(round.closeAt)
    if (late > OPEN_PAST_DEADLINE_WARN_S)
      report('WARN', 'settlement', `${prefix}: deadline passed ${late}s ago; lock() is due`)
    else
      report(
        'OK',
        'settlement',
        `${prefix}: closes at ${new Date(Number(round.closeAt) * 1000).toISOString()}`,
      )
  } else if (phase === 3) {
    const late = now - Number(round.closeAt)
    const lockedAt = Number(await read('lockedAtTime', [currentRoundId]))
    const cancelIn = lockedAt + Number(lockedCancelDelay) - now
    const level = late > LOCKED_FAIL_S ? 'FAIL' : late > LOCKED_WARN_S ? 'WARN' : 'OK'
    const escape =
      cancelIn > 0 ? `cancelRound() opens in ${cancelIn}s` : 'cancelRound() is open now'
    report(
      level,
      'settlement',
      `${prefix} for ${late}s; requestRandomness() is due (check treasury and the randomness provider); ${escape}`,
    )
  } else if (phase === 4) {
    if (round.randomOutput !== `0x${'0'.repeat(64)}`) {
      report('WARN', 'settlement', `${prefix}: output delivered; settle() is due`)
    } else {
      const requestedAt = Number(await read('requestedAtTime', [currentRoundId]))
      const age = Math.max(0, now - requestedAt)
      const level = age > PENDING_FAIL_S ? 'FAIL' : age > PENDING_WARN_S ? 'WARN' : 'OK'
      const forceIn = requestedAt + Number(forceCancelDelay) - now
      const escape = round.randomnessRefunded
        ? 'fee already refunded; cancelRound() is due'
        : forceIn > 0
          ? `forced cancelRound() opens in ${forceIn}s`
          : 'forced cancelRound() is open now'
      report(level, 'settlement', `${prefix}: waiting for randomness for ${age}s (${escape})`)
    }
  } else if (phase === 5 || phase === 6) {
    report('OK', 'settlement', `${prefix}; startNextRound() opens the next round`)
  } else {
    report('OK', 'settlement', prefix)
  }
  return currentRoundId
}

async function main() {
  console.log(`POTS health check at ${new Date().toISOString()}`)
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: 15000 }) })

  let head
  let now
  try {
    const block = await client.getBlock()
    head = block.number
    now = Number(block.timestamp)
    const headAge = Math.floor(Date.now() / 1000) - now
    report(
      headAge > HEAD_AGE_WARN_S ? 'WARN' : 'OK',
      'rpc',
      `${rpcUrl} head ${head}, newest block ${headAge}s old${headAge > HEAD_AGE_WARN_S ? ' (chain or RPC may be stalled)' : ''}`,
    )
  } catch (error) {
    report('FAIL', 'rpc', `${rpcUrl} unreachable (${error.shortMessage ?? error.message})`)
    return
  }

  if (!managerAddress || !/^0x[0-9a-fA-F]{40}$/.test(managerAddress)) {
    report('SKIP', 'contract', 'NEXT_PUBLIC_ROUND_MANAGER_ADDRESS is not set to a valid address')
    await checkIndexer(client, head, 0n)
    return
  }

  let currentRoundId = 0n
  try {
    currentRoundId = await checkContract(client, now)
  } catch (error) {
    report('FAIL', 'contract', `read failed (${error.shortMessage ?? error.message})`)
  }
  await checkIndexer(client, head, currentRoundId)
}

await main()
const worst = results.some((r) => r.level === 'FAIL')
  ? 2
  : results.some((r) => r.level === 'WARN')
    ? 1
    : 0
console.log(worst === 0 ? 'RESULT OK' : worst === 1 ? 'RESULT WARN' : 'RESULT FAIL')
process.exitCode = worst
