import { test, expect } from './fixtures'
import { connect, keeperButton, square } from '../support/ui'
import {
  PLAYER_ADDRESS,
  dice,
  findOutput,
  increaseTime,
  manager,
  ownerEnter,
  playerEnter,
  potsBalance,
  publicClient,
  waitForRandomnessRequest,
} from '../support/chain'

async function settleRoundOne(winningBlock: number) {
  await increaseTime(61)
  await manager.write('lock')
  await manager.write('requestRandomness')
  await dice.fulfill(await waitForRandomnessRequest(1n), findOutput(winningBlock))
  await manager.write('settle', [1n])
}

test.describe('claims after the keeper moved on', () => {
  test('the primary button claims a past round when the next round already started', async ({
    page,
    installWallet,
  }) => {
    await playerEnter([5], 10n ** 16n)
    await settleRoundOne(5)
    // The keeper starts the next round right after settling, so round 1 is no longer current.
    await manager.write('startNextRound')

    await installWallet()
    await page.goto('/mine')
    await connect(page)

    const claimEth = keeperButton(page, /^Claim [\d.]+ ETH \(round #1\)$/)
    await expect(claimEth).toBeVisible()
    await claimEth.click()
    await expect(page.getByText('Claim confirmed')).toBeVisible()
    await expect(claimEth).toBeHidden()

    const claimPots = keeperButton(page, /^Claim [\d.]+ POTS \(round #1\)$/)
    await claimPots.click()
    await expect(claimPots).toBeHidden()
    expect(await potsBalance(PLAYER_ADDRESS)).toBe(10n ** 18n)
    expect(await manager.read('invariantHolds')).toBe(true)
  })

  test('History offers a claim for every round with something to claim', async ({
    page,
    installWallet,
  }) => {
    await playerEnter([5], 10n ** 16n)
    await settleRoundOne(5)
    await manager.write('startNextRound')
    const before = await publicClient.getBalance({ address: PLAYER_ADDRESS })

    await installWallet()
    await page.goto('/history')
    await connect(page)
    await expect(page.getByText('Ready to claim:')).toBeVisible({ timeout: 30_000 })
    await keeperButton(page, /^Claim [\d.]+ ETH$/).click()
    await expect(page.getByText('Ready to claim:')).toBeVisible()
    await expect
      .poll(async () => publicClient.getBalance({ address: PLAYER_ADDRESS }))
      .toBeGreaterThan(before)
    await keeperButton(page, /^Claim [\d.]+ POTS$/).click()
    await expect(page.getByText('Ready to claim:')).toBeHidden({ timeout: 30_000 })
  })
})

test.describe('round closed before the keeper locks it', () => {
  test('the grid and the MINE button stop accepting deploys once the countdown ended', async ({
    page,
    installWallet,
    syncBrowserClock,
  }) => {
    await playerEnter([3], 10n ** 15n)
    await increaseTime(61)

    await installWallet()
    await syncBrowserClock()
    await page.goto('/mine')
    await connect(page)

    await expect(page.getByText('Round closed').first()).toBeVisible()
    await expect(square(page, 3)).toBeDisabled()
    await page.getByRole('button', { name: 'All', exact: true }).click({ force: true })
    await expect(page.getByRole('button', { name: /^MINE/ })).toBeDisabled()
    await expect(page.getByText('Round closed. The result comes next.')).toBeVisible()
  })
})

test.describe('winners and navigation marks', () => {
  test('YOU marks the connected wallet and TOP the largest share on the winning block', async ({
    page,
    installWallet,
  }) => {
    await playerEnter([3], 2n * 10n ** 15n)
    await ownerEnter([3], 10n ** 15n)
    await settleRoundOne(3)

    await installWallet()
    await page.goto('/mine')
    await connect(page)
    const winners = page.getByRole('region', { name: 'Recent winners' })
    await expect(winners.getByText('you', { exact: true })).toBeVisible()
    await expect(winners.getByText('top', { exact: true })).toBeVisible()
    await expect(winners.getByText(/· 2 winners$/)).toBeVisible()
  })

  test('the active page is gold in the navigation and MINE is the gold button', async ({
    page,
    installWallet,
  }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)

    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav.getByRole('link', { name: 'Mine' })).toHaveClass(/text-gold/)
    await expect(nav.getByRole('link', { name: 'History' })).not.toHaveClass(/text-gold\b/)
    await expect(page.getByRole('button', { name: /^MINE/ })).toHaveClass(/gold-1/)

    await nav.getByRole('link', { name: 'History' }).click()
    await expect(page).toHaveURL(/\/history$/)
    await expect(nav.getByRole('link', { name: 'History' })).toHaveClass(/text-gold/)
    await expect(nav.getByRole('link', { name: 'Mine' })).not.toHaveClass(/text-gold\b/)
  })

  test('the address menu is a disclosure that Escape closes and returns focus', async ({
    page,
    installWallet,
  }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)
    const trigger = page.getByRole('banner').getByRole('button', { name: /^0x7099/ })
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('link', { name: 'Profile' }).first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger).toBeFocused()
  })
})
