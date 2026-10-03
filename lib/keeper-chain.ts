import { createPublicClient, createWalletClient, http, type Abi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import adapterAbiJson from '@/contracts/abi/PotsRandomnessAdapter.json'
import { activeChain } from './chains'
import { managerAddress, roundManagerAbi } from './contracts'
import type { KeeperAction } from './keeper-decision'
import { classifyChainError } from './keeper-errors'
import { KeeperChainError, type KeeperChain, type KeeperChainState } from './keeper-run'
import { Phase, ZERO_BYTES32, type RoundData } from './types'

const adapterAbi = adapterAbiJson as Abi
const MAX_RECEIPT_WAIT_MS = 15_000
const RECEIPT_POLL_MS = 1_000
const MAINNET_CHAIN_ID = 4663

/**
 * Real chain access for the keeper. Errors are reduced to a kind: the raw viem message can
 * contain the RPC URL, so it is never forwarded (rules.md section 4).
 */
export function createKeeperChain(privateKey: `0x${string}`): KeeperChain {
  const account = privateKeyToAccount(privateKey)
  const transport = http(undefined, { timeout: 5_000, retryCount: 1 })
  const publicClient = createPublicClient({ chain: activeChain, transport })
  const walletClient = createWalletClient({ account, chain: activeChain, transport })

  const readManager = <T>(functionName: string, args: readonly unknown[] = []) =>
    publicClient.readContract({
      address: managerAddress,
      abi: roundManagerAbi,
      functionName,
      args,
    }) as Promise<T>

  // Immutable contract values are read once per instance; every poll of the reveal reuses them.
  let immutables:
    { lockedCancelDelay: bigint; forceCancelDelay: bigint; adapter: `0x${string}` } | undefined

  async function readImmutables() {
    if (!immutables) {
      const [lockedCancelDelay, forceCancelDelay, adapter] = await Promise.all([
        readManager<bigint>('lockedCancelDelay'),
        readManager<bigint>('forceCancelDelay'),
        readManager<`0x${string}`>('adapter'),
      ])
      immutables = { lockedCancelDelay, forceCancelDelay, adapter }
    }
    return immutables
  }

  async function refundWindowOpen(roundId: bigint): Promise<boolean> {
    try {
      await publicClient.simulateContract({
        account,
        address: managerAddress,
        abi: roundManagerAbi,
        functionName: 'refundRandomness',
        args: [roundId],
      })
      return true
    } catch (error) {
      // A revert means the refund window is not open yet; any other failure is an RPC problem.
      const kind = classifyChainError(error).kind
      if (kind === 'reverted') {
        return false
      }
      throw classifyChainError(error)
    }
  }

  return {
    async accountAllowed(): Promise<boolean> {
      if (activeChain.id !== MAINNET_CHAIN_ID) {
        return true
      }
      try {
        const owner = await readManager<`0x${string}`>('owner')
        return owner.toLowerCase() !== account.address.toLowerCase()
      } catch (error) {
        throw classifyChainError(error)
      }
    },

    async readState(): Promise<KeeperChainState> {
      try {
        const [roundId, fixed, balances, block] = await Promise.all([
          readManager<bigint>('currentRoundId'),
          readImmutables(),
          readManager<readonly [bigint, bigint, bigint]>('balances'),
          publicClient.getBlock({ blockTag: 'latest' }),
        ])
        const [fee, keeperBalance] = await Promise.all([
          publicClient.readContract({
            address: fixed.adapter,
            abi: adapterAbi,
            functionName: 'quoteFee',
          }) as Promise<bigint>,
          publicClient.getBalance({ address: account.address }),
        ])

        // A chain that makes no empty blocks leaves the latest block timestamp behind the wall
        // clock; the later of the two keeps a due deadline from looking early.
        const wallClock = BigInt(Math.floor(Date.now() / 1000))
        const base = {
          roundId,
          now: block.timestamp > wallClock ? block.timestamp : wallClock,
          lockedCancelDelay: fixed.lockedCancelDelay,
          forceCancelDelay: fixed.forceCancelDelay,
          treasury: balances[2],
          randomnessFee: fee,
          keeperBalance,
        }
        if (roundId === 0n) {
          return {
            ...base,
            phase: Phase.NONE,
            closeAt: 0n,
            randomOutput: ZERO_BYTES32,
            randomnessRefunded: false,
            lockedAt: 0n,
            requestedAt: 0n,
            refundWindowOpen: false,
          }
        }

        const [round, lockedAt, requestedAt] = await Promise.all([
          readManager<RoundData>('getRound', [roundId]),
          readManager<bigint>('lockedAtTime', [roundId]),
          readManager<bigint>('requestedAtTime', [roundId]),
        ])
        const phase = Number(round.phase)
        const pendingWithoutOutput =
          phase === Phase.RANDOMNESS_PENDING &&
          round.randomOutput === ZERO_BYTES32 &&
          !round.randomnessRefunded
        return {
          ...base,
          phase,
          closeAt: round.closeAt,
          randomOutput: round.randomOutput,
          randomnessRefunded: round.randomnessRefunded,
          lockedAt,
          requestedAt,
          refundWindowOpen: pendingWithoutOutput ? await refundWindowOpen(roundId) : false,
        }
      } catch (error) {
        throw classifyChainError(error)
      }
    },

    async send(
      action: KeeperAction,
      roundId: bigint,
      timeoutMs: number = MAX_RECEIPT_WAIT_MS,
    ): Promise<{ txHash: string }> {
      try {
        const args = action === 'settle' || action === 'refundRandomness' ? [roundId] : []
        const { request } = await publicClient.simulateContract({
          account,
          address: managerAddress,
          abi: roundManagerAbi,
          functionName: action,
          args,
        })
        const hash = await walletClient.writeContract(request)
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          timeout: Math.max(1_000, Math.min(timeoutMs, MAX_RECEIPT_WAIT_MS)),
          pollingInterval: RECEIPT_POLL_MS,
        })
        if (receipt.status !== 'success') throw new KeeperChainError('reverted')
        return { txHash: hash }
      } catch (error) {
        throw classifyChainError(error)
      }
    },
  }
}
