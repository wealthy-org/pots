import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import managerAbi from '../../contracts/abi/PotsRoundManager.json'
import planAbi from '../../contracts/abi/PotsAutoPlan.json'
import tokenV3Abi from '../../contracts/abi/POTSToken.json'

export const ANVIL_PORT = 8599
export const ANVIL_URL = `http://127.0.0.1:${ANVIL_PORT}`

export const MANAGER: Address = '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'
export const TOKEN: Address = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
// Plan contract of the local deploy (deployer nonce 4); global-setup does not change this order.
export const PLAN: Address = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9'
export const DICE: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3'

// Well-known Anvil development keys (accounts 0 and 1). They hold no real funds anywhere.
export const OWNER_KEY: Hex = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
export const PLAYER_KEY: Hex = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
export const PLAYER_ADDRESS: Address = privateKeyToAccount(PLAYER_KEY).address
export const OWNER_ADDRESS: Address = privateKeyToAccount(OWNER_KEY).address

// Anvil development account 2 acts as the keeper in the local suite; the secret is a test value.
export const KEEPER_KEY: Hex = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
export const KEEPER_SECRET = 'e2e-keeper-secret-0123456789abcdef0123456789'

const diceAbi = parseAbi([
  'function fulfill(uint64 sequenceNumber, bytes32 random)',
  'function setFailRequests(bool failing)',
  'function setFailRefunds(bool failing)',
])
const tokenAbi = parseAbi(['function balanceOf(address owner) view returns (uint256)'])

export const publicClient = createPublicClient({ transport: http(ANVIL_URL) })
const ownerWallet = createWalletClient({
  account: privateKeyToAccount(OWNER_KEY),
  transport: http(ANVIL_URL),
})

export async function rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(ANVIL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = (await response.json()) as { result: T; error?: { message: string } }
  if (body.error) {
    throw new Error(`${method}: ${body.error.message}`)
  }
  return body.result
}

export async function snapshot(): Promise<string> {
  return rpc<string>('evm_snapshot')
}

export async function revert(id: string): Promise<void> {
  await rpc('evm_revert', [id])
}

export async function increaseTime(seconds: number): Promise<void> {
  await rpc('evm_increaseTime', [seconds])
  await rpc('evm_mine')
}

export async function mineBlocks(count: number): Promise<void> {
  await rpc('anvil_mine', ['0x' + count.toString(16)])
}

async function ownerWrite(
  address: Address,
  abi: unknown,
  functionName: string,
  args: unknown[] = [],
) {
  const hash = await ownerWallet.writeContract({
    address,
    abi: abi as never,
    functionName: functionName as never,
    args: args as never,
    chain: null,
  })
  await publicClient.waitForTransactionReceipt({ hash })
}

export const manager = {
  write: (functionName: string, args: unknown[] = []) =>
    ownerWrite(MANAGER, managerAbi, functionName, args),
  read: (functionName: string, args: unknown[] = []): Promise<unknown> =>
    publicClient.readContract({
      address: MANAGER,
      abi: managerAbi as never,
      functionName: functionName as never,
      args: args as never,
    }) as Promise<unknown>,
}

export const dice = {
  fulfill: (sequence: bigint, output: Hex) =>
    ownerWrite(DICE, diceAbi, 'fulfill', [sequence, output]),
  failRequests: (failing: boolean) => ownerWrite(DICE, diceAbi, 'setFailRequests', [failing]),
  failRefunds: (failing: boolean) => ownerWrite(DICE, diceAbi, 'setFailRefunds', [failing]),
}

const playerWallet = createWalletClient({
  account: privateKeyToAccount(PLAYER_KEY),
  transport: http(ANVIL_URL),
})

export async function playerEnter(squares: number[], amountPerSquare: bigint): Promise<void> {
  const hash = await playerWallet.writeContract({
    address: MANAGER,
    abi: managerAbi as never,
    functionName: 'enter' as never,
    args: [squares, amountPerSquare] as never,
    value: amountPerSquare * BigInt(squares.length),
    chain: null,
  })
  await publicClient.waitForTransactionReceipt({ hash })
}

export async function chainTimeMs(): Promise<number> {
  const block = await publicClient.getBlock()
  return Number(block.timestamp) * 1000
}

export async function potsBalance(owner: Address): Promise<bigint> {
  return publicClient.readContract({
    address: TOKEN,
    abi: tokenAbi,
    functionName: 'balanceOf',
    args: [owner],
  })
}

/** Finds a random output whose winning square is `square` and that does not hit the jackpot. */
export function findOutput(square: number): Hex {
  for (let i = 0; i < 200_000; i += 1) {
    const candidate = keccak256(encodePacked(['string', 'uint256'], ['pots-output', BigInt(i)]))
    const winning =
      Number(BigInt(keccak256(encodePacked(['bytes32', 'string'], [candidate, 'SQUARE']))) % 25n) +
      1
    const jackpot =
      BigInt(keccak256(encodePacked(['bytes32', 'string'], [candidate, 'JACKPOT']))) % 625n === 0n
    if (winning === square && !jackpot) {
      return candidate
    }
  }
  throw new Error(`No output found for square ${square}`)
}

/** Waits until the randomness request of a round is mined and returns its sequence number. */
export async function waitForRandomnessRequest(roundId: bigint): Promise<bigint> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const round = (await manager.read('getRound', [roundId])) as {
      phase: number
      randomnessRequestId: bigint
    }
    if (round.phase === 4) {
      return round.randomnessRequestId
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('the randomness request was never mined')
}

export async function ownerEnter(squares: number[], amountPerSquare: bigint): Promise<void> {
  const hash = await ownerWallet.writeContract({
    address: MANAGER,
    abi: managerAbi as never,
    functionName: 'enter' as never,
    args: [squares, amountPerSquare] as never,
    value: amountPerSquare * BigInt(squares.length),
    chain: null,
  })
  await publicClient.waitForTransactionReceipt({ hash })
}

export const plan = {
  write: (functionName: string, args: unknown[] = []) =>
    ownerWrite(PLAN, planAbi, functionName, args),
  read: (functionName: string, args: unknown[] = []): Promise<unknown> =>
    publicClient.readContract({
      address: PLAN,
      abi: planAbi as never,
      functionName: functionName as never,
      args: args as never,
    }) as Promise<unknown>,
}

/** A write signed by the player key (Anvil account 1) straight to a contract. */
export async function playerWrite(
  address: Address,
  abi: unknown,
  functionName: string,
  args: unknown[] = [],
): Promise<void> {
  const hash = await playerWallet.writeContract({
    address,
    abi: abi as never,
    functionName: functionName as never,
    args: args as never,
    chain: null,
  })
  await publicClient.waitForTransactionReceipt({ hash })
}

export const playerManager = {
  write: (functionName: string, args: unknown[] = []) =>
    playerWrite(MANAGER, managerAbi, functionName, args),
}

/** Reads the v3 token (`totalSupply`, `totalMinted`). */
export function tokenRead(functionName: string, args: unknown[] = []): Promise<bigint> {
  return publicClient.readContract({
    address: TOKEN,
    abi: tokenV3Abi as never,
    functionName: functionName as never,
    args: args as never,
  }) as Promise<bigint>
}
