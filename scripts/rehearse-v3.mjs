// v3 testnet rehearsal (Task 12.1). Drives a funded player wallet and the real keeper route
// (a local app with the v3 addresses) through the new flows and logs every transaction.
// Keys come from gitignored files: .env (DEPLOYER_PRIVATE_KEY) and .env.rehearsal.local.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  parseEther,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const root = new URL('../', import.meta.url)
const abi = (name) => JSON.parse(readFileSync(new URL(`contracts/abi/${name}.json`, root), 'utf8'))
const managerAbi = abi('PotsRoundManager')
const planAbi = abi('PotsAutoPlan')
const tokenAbi = abi('POTSToken')

function envFile(name) {
  const path = new URL(name, root)
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('=') && !line.startsWith('#'))
      .map((line) => [
        line.slice(0, line.indexOf('=')).trim(),
        line.slice(line.indexOf('=') + 1).trim(),
      ]),
  )
}

const RPC = 'https://robinhood-sepolia-rpc.publicnode.com'
const MANAGER = process.env.V3_MANAGER
const PLAN = process.env.V3_PLAN
const TOKEN = process.env.V3_TOKEN
const DEPLOY_BLOCK = BigInt(process.env.V3_DEPLOY_BLOCK ?? '0')
const KEEPER_URL = process.env.KEEPER_URL ?? 'http://localhost:3219/api/keeper'
const KEEPER_SECRET = process.env.KEEPER_SECRET
const LOG = new URL('project-context/plans/phase-12-testnet-evidence.log', root)

const chain = defineChain({
  id: 46630,
  name: 'Robinhood testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
})
const pub = createPublicClient({ chain, transport: http(RPC) })

const deployerKey = envFile('.env').DEPLOYER_PRIVATE_KEY
let playerKey = envFile('.env.rehearsal.local').PLAYER_PRIVATE_KEY
if (!playerKey) {
  playerKey = generatePrivateKey()
  writeFileSync(new URL('.env.rehearsal.local', root), `PLAYER_PRIVATE_KEY=${playerKey}\n`)
}
const deployer = privateKeyToAccount(deployerKey)
const player = privateKeyToAccount(playerKey)
const wallets = {
  deployer: createWalletClient({ account: deployer, chain, transport: http(RPC) }),
  player: createWalletClient({ account: player, chain, transport: http(RPC) }),
}

function log(line) {
  const text = `${new Date().toISOString()} ${line}`
  console.log(text)
  appendFileSync(LOG, text + '\n')
}

async function send(label, who, request) {
  const hash = await wallets[who].writeContract(request)
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 })
  log(
    `${label}: ${receipt.status} block=${receipt.blockNumber} gas=${receipt.gasUsed} hash=${hash}`,
  )
  if (receipt.status !== 'success') throw new Error(`${label} reverted`)
  return receipt
}

const m = (functionName, args = []) =>
  pub.readContract({ address: MANAGER, abi: managerAbi, functionName, args })
const p = (functionName, args = []) =>
  pub.readContract({ address: PLAN, abi: planAbi, functionName, args })
const t = (functionName, args = []) =>
  pub.readContract({ address: TOKEN, abi: tokenAbi, functionName, args })

async function invariants(step) {
  const [a, b, supply, minted] = await Promise.all([
    m('invariantHolds'),
    p('planInvariantHolds'),
    t('totalSupply'),
    t('totalMinted'),
  ])
  log(
    `INVARIANT after ${step}: manager=${a} plan=${b} totalSupply=${formatEther(supply)} totalMinted=${formatEther(minted)}`,
  )
  if (!a || !b) throw new Error(`invariant broken after ${step}`)
}

async function keeper(note) {
  const response = await fetch(KEEPER_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${KEEPER_SECRET}` },
  })
  const body = await response.json()
  const names = (body.actions ?? []).map(
    (x) => `${x.name}:${x.ok ? 'ok' : x.reason}${x.txHash ? ':' + x.txHash : ''}`,
  )
  log(
    `KEEPER ${note} http=${response.status} status=${body.status} round=${body.round?.id}/${body.round?.phase} plans=${JSON.stringify(body.plans ?? null)} alerts=${JSON.stringify(body.alerts)} actions=[${names.join(' ')}]`,
  )
  return body
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function until(label, check, { every = 15_000, timeout = 600_000 } = {}) {
  const started = Date.now()
  for (;;) {
    await keeper(label)
    if (await check()) return
    if (Date.now() - started > timeout) throw new Error(`timeout waiting for ${label}`)
    await sleep(every)
  }
}

const roundOf = async (id) => m('getRound', [id])
const SQUARES = [2, 7, 13, 19]
const AMOUNT = parseEther('0.0001')
const ALL = Array.from({ length: 25 }, (_, i) => i + 1)

async function main() {
  log(
    `=== v3 REHEARSAL manager=${MANAGER} plan=${PLAN} token=${TOKEN} player=${player.address} ===`,
  )
  log(
    `deployer balance ${formatEther(await pub.getBalance({ address: deployer.address }))} player ${formatEther(await pub.getBalance({ address: player.address }))}`,
  )

  if ((await pub.getBalance({ address: player.address })) < parseEther('0.004')) {
    await send('S0a fund treasury 0.0005', 'deployer', {
      address: MANAGER,
      abi: managerAbi,
      functionName: 'fundTreasury',
      value: parseEther('0.0005'),
    })
    const hash = await wallets.deployer.sendTransaction({
      to: player.address,
      value: parseEther('0.0042'),
    })
    await pub.waitForTransactionReceipt({ hash })
    log(`S0b fund player 0.0042 ETH: hash=${hash}`)
  }
  await invariants('S0 funding')

  await send('S1 player setReferrer(deployer)', 'player', {
    address: MANAGER,
    abi: managerAbi,
    functionName: 'setReferrer',
    args: [deployer.address],
  })
  log(`referrerOf(player)=${await m('referrerOf', [player.address])}`)
  await send('S2 player setPlanClaimConsent(true)', 'player', {
    address: MANAGER,
    abi: managerAbi,
    functionName: 'setPlanClaimConsent',
    args: [true],
  })
  await send('S3 player createPlan(4 blocks, 0.0001, 3 rounds, loop on)', 'player', {
    address: PLAN,
    abi: planAbi,
    functionName: 'createPlan',
    args: [SQUARES, AMOUNT, 3, true],
    value: AMOUNT * 4n * 3n,
  })
  log(
    `plan=${JSON.stringify(await p('getPlan', [player.address]), (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`,
  )
  await invariants('S3 createPlan')

  // The keeper starts round 1 and the plan enters it with no human action (L-116).
  await until(
    'S4 keeper opens round 1 and executes the plan',
    async () => (await m('currentRoundId')) >= 1n && (await roundOf(1n)).phase === 2,
  )
  const r1 = await roundOf(1n)
  log(`round 1 phase=${r1.phase} totalEth=${formatEther(r1.totalEth)} closeAt=${r1.closeAt}`)
  log(`entry(1, square 2, player)=${await m('getEntry', [1n, 2, player.address])}`)
  await invariants('S4 plan execution')

  await send('S5 player enter all 25 blocks in round 1', 'player', {
    address: MANAGER,
    abi: managerAbi,
    functionName: 'enter',
    args: [ALL, AMOUNT],
    value: AMOUNT * 25n,
  })
  await invariants('S5 manual entry')

  await until('S6 round 1 settles', async () => (await roundOf(1n)).phase === 5, {
    timeout: 900_000,
  })
  const settled = await roundOf(1n)
  log(
    `round 1 settled winningSquare=${settled.winningSquare} pool=${formatEther(settled.totalEth)}`,
  )

  const supply0 = await t('totalSupply')
  const deployerPots0 = await t('balanceOf', [deployer.address])
  await send('S7 player claimPots(1)', 'player', {
    address: MANAGER,
    abi: managerAbi,
    functionName: 'claimPots',
    args: [1n],
  })
  const playerPots = await t('balanceOf', [player.address])
  const bonus = (await t('balanceOf', [deployer.address])) - deployerPots0
  log(
    `player POTS=${formatEther(playerPots)} referrer bonus=${formatEther(bonus)} supply +${formatEther((await t('totalSupply')) - supply0)}`,
  )
  await invariants('S7 claimPots')

  const minted0 = await t('totalMinted')
  await send('S8 player burn 0.4 POTS', 'player', {
    address: TOKEN,
    abi: tokenAbi,
    functionName: 'burn',
    args: [parseEther('0.4')],
  })
  log(
    `after burn: totalSupply=${formatEther(await t('totalSupply'))} totalMinted=${formatEther(await t('totalMinted'))} (was ${formatEther(minted0)}) player POTS=${formatEther(await t('balanceOf', [player.address]))}`,
  )
  await invariants('S8 burn')

  // Loop: the next plan visit moves the round 1 ETH winnings into the plan.
  await until(
    'S9 plan visits round 2 and compounds the round 1 winnings',
    async () => {
      const plan = await p('getPlan', [player.address])
      return plan.lastRound >= 2n
    },
    { timeout: 900_000 },
  )
  const logs = await pub.getLogs({ address: PLAN, fromBlock: DEPLOY_BLOCK, toBlock: 'latest' })
  const names = {}
  for (const l of logs) names[l.topics[0]] = (names[l.topics[0]] ?? 0) + 1
  log(`plan events by topic0: ${JSON.stringify(names)}`)
  const compounded = await pub.getContractEvents({
    address: PLAN,
    abi: planAbi,
    eventName: 'PlanCompounded',
    fromBlock: DEPLOY_BLOCK,
  })
  const executed = await pub.getContractEvents({
    address: PLAN,
    abi: planAbi,
    eventName: 'PlanExecuted',
    fromBlock: DEPLOY_BLOCK,
  })
  log(
    `PlanCompounded=${compounded.map((e) => `${e.args.roundId}:${formatEther(e.args.amount)}`).join(',')} PlanExecuted=${executed.map((e) => e.args.roundId).join(',')}`,
  )
  log(
    `plan after compounding=${JSON.stringify(await p('getPlan', [player.address]), (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`,
  )
  await invariants('S9 compounding')

  await until(
    'S10 plan has executed three rounds',
    async () =>
      (
        await pub.getContractEvents({
          address: PLAN,
          abi: planAbi,
          eventName: 'PlanExecuted',
          fromBlock: DEPLOY_BLOCK,
        })
      ).length >= 3,
    { timeout: 1_200_000 },
  )
  await invariants('S10 three plan rounds')

  // Pause with exit: no plan is visited while paused, and the wallet can still stop its plan.
  await send('S11 owner pause', 'deployer', {
    address: MANAGER,
    abi: managerAbi,
    functionName: 'pause',
  })
  const before = await p('getPlan', [player.address])
  await keeper('S11 keeper while paused')
  const afterPause = await p('getPlan', [player.address])
  log(
    `paused: lastRound ${before.lastRound} -> ${afterPause.lastRound}, balance ${formatEther(before.balance)} -> ${formatEther(afterPause.balance)}`,
  )
  const ethBefore = await pub.getBalance({ address: player.address })
  await send('S12 player cancelPlan while paused', 'player', {
    address: PLAN,
    abi: planAbi,
    functionName: 'cancelPlan',
  })
  log(
    `cancel returned about ${formatEther((await pub.getBalance({ address: player.address })) - ethBefore)} ETH (plan balance was ${formatEther(afterPause.balance)})`,
  )
  log(
    `plan after cancel=${JSON.stringify(await p('getPlan', [player.address]), (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`,
  )
  await send('S13 owner unpause', 'deployer', {
    address: MANAGER,
    abi: managerAbi,
    functionName: 'unpause',
  })
  await invariants('S13 pause, cancel, unpause')

  // Let the round in flight finish so no round is left pending, then claim what is owed.
  await until(
    'S14 current round reaches a rest state',
    async () => {
      const id = await m('currentRoundId')
      const phase = (await roundOf(id)).phase
      return phase === 1 || phase === 5 || phase === 6
    },
    { timeout: 900_000 },
  )
  await invariants('S14 end state')
  log(
    `final: deployer ${formatEther(await pub.getBalance({ address: deployer.address }))} player ${formatEther(await pub.getBalance({ address: player.address }))}`,
  )
  log('=== v3 REHEARSAL DONE ===')
}

main().catch((error) => {
  log(`FAILED: ${error.shortMessage ?? error.message}`)
  process.exit(1)
})
