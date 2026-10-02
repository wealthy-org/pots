import { test, expect } from '@playwright/test'
import { createPublicClient, http, type Address, type Hex } from 'viem'
import managerAbi from '../../contracts/abi/PotsRoundManager.json'
import { installMockWallet } from '../support/wallet'
import { connect, enterThroughUi, keeperButton } from '../support/ui'

const rpcUrl = process.env.E2E_RPC_URL ?? 'https://robinhood-sepolia-rpc.publicnode.com'
const playerKey = process.env.E2E_PLAYER_KEY as Hex | undefined
const managerAddress = process.env.E2E_MANAGER_ADDRESS as Address | undefined

const MINUTE = 60_000

test.describe('testnet rehearsal (needs a funded account and a deployed contract)', () => {
  test.skip(
    !playerKey || !managerAddress,
    'Set E2E_PLAYER_KEY (a funded testnet key) and E2E_MANAGER_ADDRESS to run the funded rehearsal.',
  )

  test('enters, settles, and claims on the live chain', async ({ page }) => {
    const client = createPublicClient({ transport: http(rpcUrl) })
    const readRound = async () => {
      const roundId = (await client.readContract({
        address: managerAddress as Address,
        abi: managerAbi as never,
        functionName: 'currentRoundId' as never,
      })) as bigint
      const round = (await client.readContract({
        address: managerAddress as Address,
        abi: managerAbi as never,
        functionName: 'getRound' as never,
        args: [roundId] as never,
      })) as { phase: number; closeAt: bigint; randomOutput: Hex }
      return { roundId, round }
    }

    await installMockWallet(page, {
      privateKey: playerKey as Hex,
      chainId: 46630,
      rpcUrl,
    })
    await page.goto('/mine')
    await connect(page).catch(() => undefined)

    const { round: before } = await readRound()
    if (before.phase === 0 || before.phase === 5 || before.phase === 6) {
      await keeperButton(page, /^Start (round 1|next round)$/).click()
    }

    await enterThroughUi(page, [13], '0.001')

    // Deterministic wait: the deadline is on chain, so poll it instead of sleeping.
    await expect
      .poll(
        async () => {
          const { round } = await readRound()
          return Math.floor(Date.now() / 1000) >= Number(round.closeAt)
        },
        { timeout: 3 * MINUTE, intervals: [2_000] },
      )
      .toBe(true)

    await keeperButton(page, 'Lock round').click()
    await keeperButton(page, 'Request randomness').click()
    await expect(page.getByRole('heading', { name: 'Randomness pending' })).toBeVisible()

    // The provider delivers the output; a missing reveal is handled by the refund path instead.
    await expect(keeperButton(page, 'Settle round')).toBeVisible({ timeout: 10 * MINUTE })
    await keeperButton(page, 'Settle round').click()
    await expect(page.getByText('Winning square')).toBeVisible()

    const claimEth = keeperButton(page, /^Claim [\d.]+ ETH$/)
    if (await claimEth.isVisible()) {
      await claimEth.click()
      await expect(claimEth).toBeHidden()
    }
  })
})
