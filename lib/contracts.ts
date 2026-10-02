import type { Abi } from 'viem'
import potsRoundManagerAbiJson from '@/contracts/abi/PotsRoundManager.json'
import potsTokenAbiJson from '@/contracts/abi/POTSToken.json'
import { activeChain } from './chains'

export const roundManagerAbi = potsRoundManagerAbiJson as Abi
export const potsTokenAbi = potsTokenAbiJson as Abi

const anvilDefaults = {
  manager: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
  token: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  adapter: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
} as const

function resolveAddress(value: string | undefined, fallback: `0x${string}`): `0x${string}` {
  if (value && /^0x[0-9a-fA-F]{40}$/.test(value)) {
    return value as `0x${string}`
  }
  return fallback
}

function resolveBlock(value: string | undefined): bigint {
  return value && /^\d+$/.test(value) ? BigInt(value) : 0n
}

export const managerAddress = resolveAddress(
  process.env.NEXT_PUBLIC_ROUND_MANAGER_ADDRESS,
  activeChain.id === 31337 ? anvilDefaults.manager : '0x0000000000000000000000000000000000000000',
)

export const tokenAddress = resolveAddress(
  process.env.NEXT_PUBLIC_POTS_TOKEN_ADDRESS,
  activeChain.id === 31337 ? anvilDefaults.token : '0x0000000000000000000000000000000000000000',
)

/** First block that can hold manager events; contract event scans start here instead of block 0. */
export const managerDeployBlock = resolveBlock(process.env.NEXT_PUBLIC_ROUND_MANAGER_DEPLOY_BLOCK)
