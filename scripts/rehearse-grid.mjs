// Live grid rehearsal: 5 funded wallets, 3 rounds, 5 different blocks each (all 25 blocks filled).
// The production keeper (Vercel + cron-job.org) drives every transition; this script only enters,
// claims, and moves funds between its own wallets. Keys: gitignored .env and .env.rehearsal5.local.
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
const MANAGER = '0x77E5fE9f26Df54C972555A962c508801174e10E7'
const RPC = 'https://robinhood-sepolia-rpc.publicnode.com'
const LOG = new URL('project-context/plans/phase-12-testnet-evidence.log', root)
const MARK = process.env.MARK_FILE

function envFile(name) {
  const path = new URL(name, root)
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
}
const chain = defineChain({
  id: 46630,
  name: 'Robinhood testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
})
const pub = createPublicClient({ chain, transport: http(RPC) })
const mk = (key) => {
  const account = privateKeyToAccount(key)
  return { account, client: createWalletClient({ account, chain, transport: http(RPC) }) }
}

const deployer = mk(envFile('.env').DEPLOYER_PRIVATE_KEY)
const rehearsalPlayer = mk(envFile('.env.rehearsal.local').PLAYER_PRIVATE_KEY)
let keys = ['K1', 'K2', 'K3', 'K4', 'K5'].map((k) => envFile('.env.rehearsal5.local')[k])
if (keys.some((k) => !k)) {
  keys = keys.map(() => generatePrivateKey())
  writeFileSync(
    new URL('.env.rehearsal5.local', root),
    keys.map((k, i) => `K${i + 1}=${k}`).join('\n') + '\n',
  )
}
const accounts = keys.map(mk)
const names = ['A', 'B', 'C', 'D', 'E']

function log(line) {
  const text = `${new Date().toISOString()} ${line}`
  console.log(text)
  appendFileSync(LOG, text + '\n')
}
const mark = (line) => {
  if (MARK) appendFileSync(MARK, `${new Date().toISOString()} ${line}\n`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const m = (functionName, args = []) =>
  pub.readContract({ address: MANAGER, abi: managerAbi, functionName, args })
const bal = (address) => pub.getBalance({ address })

async function transfer(from, to, value, label) {
  const hash = await from.client.sendTransaction({ to, value })
  await pub.waitForTransactionReceipt({ hash })
  log(
    `${label}: ${formatEther(value)} ETH ${from.account.address.slice(0, 8)} -> ${to.slice(0, 8)} hash=${hash}`,
  )
}

const PER_ROUND = parseEther('0.0005') // 5 blocks x 0.0001 ETH
const NEED = PER_ROUND + parseEther('0.00001') // plus gas of a 5-block entry
const KEEPER_RESERVE = parseEther('0.0021') // the keeper alert threshold is 0.002 ETH without plans
const PLAYER_RESERVE = parseEther('0.00003')

async function waitPhase(roundId, phases, timeoutMs, label) {
  const started = Date.now()
  for (;;) {
    const round = await m('getRound', [roundId])
    if (phases.includes(Number(round.phase))) return round
    if (Date.now() - started > timeoutMs) throw new Error(`timeout waiting for ${label}`)
    await sleep(5000)
  }
}

/** Gives every wallet enough for one round, taking from wallets with a surplus, then the test player, then the deployer. */
async function fundAll() {
  for (const a of accounts) {
    let have = await bal(a.account.address)
    if (have >= NEED) continue
    const donors = []
    for (const d of accounts)
      if (d !== a)
        donors.push({
          who: d,
          spare: (await bal(d.account.address)) - NEED - parseEther('0.00001'),
        })
    donors.push({
      who: rehearsalPlayer,
      spare: (await bal(rehearsalPlayer.account.address)) - PLAYER_RESERVE,
    })
    donors.push({ who: deployer, spare: (await bal(deployer.account.address)) - KEEPER_RESERVE })
    for (const d of donors) {
      if (have >= NEED) break
      const give = d.spare < NEED - have ? d.spare : NEED - have
      if (give > parseEther('0.000001')) {
        await transfer(d.who, a.account.address, give, `fund ${names[accounts.indexOf(a)]}`)
        have += give
      }
    }
    if (have < NEED) throw new Error(`not enough spare funds for ${names[accounts.indexOf(a)]}`)
  }
}

/** Claims ETH and POTS for every wallet that holds ETH on the winning block. */
async function claimWinners(roundId, winning) {
  for (const a of accounts) {
    const stake = await m('getEntry', [roundId, winning, a.account.address])
    if (stake === 0n) continue
    for (const fn of ['claimEth', 'claimPots']) {
      const hash = await a.client.writeContract({
        address: MANAGER,
        abi: managerAbi,
        functionName: fn,
        args: [roundId],
      })
      const rc = await pub.waitForTransactionReceipt({ hash })
      log(`${fn} by ${names[accounts.indexOf(a)]} (round ${roundId}): ${rc.status} hash=${hash}`)
    }
  }
}

async function settleAndClaim(roundId, label) {
  const settled = await waitPhase(roundId, [5, 6], 480_000, 'settlement by the keeper')
  const winning = Number(settled.winningSquare)
  log(
    `round ${roundId} settled (${label}): winning block ${winning}, pool=${formatEther(settled.payoutPool)} ETH rolledOver=${settled.payoutPool === 0n} jackpotHit=${settled.jackpotHit}`,
  )
  mark(`SETTLED ${label} chain_round=${roundId} winning_block=${winning}`)
  await claimWinners(roundId, winning)
  log(`invariantHolds=${await m('invariantHolds')}`)
}

async function main() {
  const resumeRound = process.env.RESUME_SETTLE ? BigInt(process.env.RESUME_SETTLE) : null
  const rounds = Number(process.env.TEST_ROUNDS ?? '3')
  const rotation = Number(process.env.ROTATION_START ?? '0')
  log(
    `=== GRID REHEARSAL (5 wallets, ${rounds} full rounds, 5 blocks each) accounts=${accounts.map((a) => a.account.address).join(',')} ===`,
  )
  if (resumeRound) await settleAndClaim(resumeRound, 'resumed round')

  for (let k = 0; k < rounds; k += 1) {
    await fundAll()
    let roundId = await m('currentRoundId')
    let current = await m('getRound', [roundId])
    if (Number(current.phase) === 5 || Number(current.phase) === 6) {
      await waitPhase(roundId + 1n, [1], 180_000, 'next round WAITING').catch(() =>
        log('next round not started by the keeper in 3 min; enter starts it'),
      )
      roundId = await m('currentRoundId')
    }
    log(`--- test round ${k + 1} of ${rounds} ---`)
    const sets = accounts.map((_, i) =>
      Array.from({ length: 5 }, (_, j) => ((i + k + rotation) % 5) * 5 + j + 1),
    )
    const results = await Promise.all(
      accounts.map(async (a, i) => {
        const hash = await a.client.writeContract({
          address: MANAGER,
          abi: managerAbi,
          functionName: 'enter',
          args: [sets[i], parseEther('0.0001')],
          value: PER_ROUND,
        })
        const receipt = await pub.waitForTransactionReceipt({ hash })
        return { i, hash, status: receipt.status }
      }),
    )
    for (const r of results)
      log(`enter ${names[r.i]} blocks [${sets[r.i].join(',')}]: ${r.status} hash=${r.hash}`)
    const entered = await m('currentRoundId')
    const round = await m('getRound', [entered])
    log(
      `round ${entered} totalEth=${formatEther(round.totalEth)} closeAt=${round.closeAt} phase=${round.phase}`,
    )
    mark(
      `ENTRIES_DONE test_round=${k + 1} chain_round=${entered} totalEth=${formatEther(round.totalEth)}`,
    )
    await settleAndClaim(entered, `test round ${k + 1}`)
  }

  // Return everything to the deployer, so the keeper account keeps the test money.
  for (const a of accounts) {
    const have = await bal(a.account.address)
    const send = have - parseEther('0.00001')
    if (send > 0n)
      await transfer(a, deployer.account.address, send, `sweep ${names[accounts.indexOf(a)]}`)
  }
  log(
    `final deployer ${formatEther(await bal(deployer.account.address))} player ${formatEther(await bal(rehearsalPlayer.account.address))} invariantHolds=${await m('invariantHolds')}`,
  )
  log('=== GRID REHEARSAL DONE ===')
  mark('DONE')
}
main().catch((error) => {
  log(`FAILED: ${error.shortMessage ?? error.message}`)
  mark('FAILED')
  process.exit(1)
})
