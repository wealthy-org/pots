import { test, expect } from './fixtures'
import { connect, enterThroughUi, keeperButton } from '../support/ui'
import {
  PLAYER_ADDRESS,
  dice,
  findOutput,
  increaseTime,
  manager,
  potsBalance,
  publicClient,
} from '../support/chain'

test.describe('settlement and claims', () => {
  test('plays a round from entry to claiming ETH and POTS', async ({ page, installWallet }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)
    const balanceBefore = await publicClient.getBalance({ address: PLAYER_ADDRESS })

    await enterThroughUi(page, [5], '0.01')

    await increaseTime(61)
    await keeperButton(page, 'Lock round').click()
    await keeperButton(page, 'Request randomness').click()
    await expect(page.getByRole('heading', { name: 'Randomness pending' })).toBeVisible()

    const round = (await manager.read('getRound', [1n])) as { randomnessRequestId: bigint }
    await dice.fulfill(round.randomnessRequestId, findOutput(5))
    await keeperButton(page, 'Settle round').click()

    await expect(page.getByText(/^Winning square #5/)).toBeVisible()
    await keeperButton(page, /^Claim [\d.]+ ETH$/).click()
    await expect(keeperButton(page, /^Claim [\d.]+ ETH$/)).toBeHidden()
    await keeperButton(page, /^Claim [\d.]+ POTS$/).click()
    await expect(keeperButton(page, /^Claim [\d.]+ POTS$/)).toBeHidden()

    expect(await potsBalance(PLAYER_ADDRESS)).toBe(10n ** 18n)
    const balanceAfter = await publicClient.getBalance({ address: PLAYER_ADDRESS })
    // The wallet recovers 90% of its 0.01 ETH entry; the loss is the 0.001 ETH fee share plus gas.
    expect(balanceBefore - balanceAfter).toBeLessThan(5n * 10n ** 15n)
    expect(balanceBefore - balanceAfter).toBeGreaterThan(10n ** 15n)
    expect(await manager.read('invariantHolds')).toBe(true)
  })

  test('shows no claim for a wallet whose square did not win', async ({ page, installWallet }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)
    await enterThroughUi(page, [5], '0.01')

    await increaseTime(61)
    await keeperButton(page, 'Lock round').click()
    await keeperButton(page, 'Request randomness').click()
    const round = (await manager.read('getRound', [1n])) as { randomnessRequestId: bigint }
    await dice.fulfill(round.randomnessRequestId, findOutput(21))
    await keeperButton(page, 'Settle round').click()

    await expect(page.getByText(/^Winning square #21/)).toBeVisible()
    await expect(page.getByText('No claimable reward for this wallet in this round.')).toBeVisible()
  })

  test('rolls an empty winning square over to the next round', async ({ page, installWallet }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)
    await enterThroughUi(page, [5], '0.01')

    await increaseTime(61)
    await keeperButton(page, 'Lock round').click()
    await keeperButton(page, 'Request randomness').click()
    const round = (await manager.read('getRound', [1n])) as { randomnessRequestId: bigint }
    await dice.fulfill(round.randomnessRequestId, findOutput(12))
    await keeperButton(page, 'Settle round').click()
    await keeperButton(page, 'Start next round').click()

    await expect(page.getByText(/Round #?2/).first()).toBeVisible()
    const [rollover] = (await manager.read('balances')) as [bigint, bigint, bigint]
    expect(rollover).toBe(9n * 10n ** 15n)
  })
})
