import { test, expect } from './fixtures'
import { connect } from '../support/ui'
import {
  dice,
  findOutput,
  increaseTime,
  manager,
  playerEnter,
  waitForRandomnessRequest,
} from '../support/chain'

async function settleRoundOne(winningBlock: number) {
  await increaseTime(61)
  await manager.write('lock')
  await manager.write('requestRandomness')
  await dice.fulfill(await waitForRandomnessRequest(1n), findOutput(winningBlock))
  await manager.write('settle', [1n])
}

test.describe('wallet detection', () => {
  test('without an injected wallet the header and the panel say so and offer no connect', async ({
    page,
  }) => {
    await page.goto('/mine')
    await expect(
      page.getByRole('banner').getByRole('button', { name: 'No wallet detected' }),
    ).toBeDisabled()
    await expect(page.getByRole('button', { name: 'No wallet detected' }).last()).toBeDisabled()
    await expect(page.getByText('Install MetaMask or Phantom (EVM)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Connect wallet' })).toHaveCount(0)
  })
})

test.describe('History on a phone', () => {
  test('a connected wallet with a deploy shows History without horizontal overflow at 360 px', async ({
    page,
    installWallet,
  }) => {
    await playerEnter([5], 10n ** 16n)
    await settleRoundOne(5)
    await page.setViewportSize({ width: 360, height: 780 })
    await installWallet()
    await page.goto('/history')
    await connect(page)
    await expect(page.getByText('Ready to claim:')).toBeVisible({ timeout: 30_000 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    await expect(
      page.getByRole('listitem').getByText('Claimed minus deployed').first(),
    ).toBeVisible()
  })
})

test.describe('late keeper and claim marks', () => {
  test('a round past its deadline and grace links to the operator page', async ({
    page,
    installWallet,
    syncBrowserClock,
  }) => {
    await playerEnter([3], 10n ** 15n)
    await increaseTime(61 + 95)
    await installWallet()
    await syncBrowserClock()
    await page.goto('/mine')
    await connect(page)
    await expect(page.getByText('the keeper has not locked this round yet')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open the operator page' })).toBeVisible()
  })

  test('the YOU row keeps claim ready after the next round has started', async ({
    page,
    installWallet,
  }) => {
    await playerEnter([3], 10n ** 15n)
    await settleRoundOne(3)
    await manager.write('startNextRound')
    await installWallet()
    await page.goto('/mine')
    await connect(page)
    const winners = page.getByRole('region', { name: 'Recent winners' })
    await expect(winners.getByText('claim ready')).toBeVisible({ timeout: 30_000 })
  })
})
