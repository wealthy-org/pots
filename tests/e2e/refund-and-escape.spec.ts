import { test, expect } from './fixtures'
import { connect, keeperButton, openMine, openOps } from '../support/ui'
import {
  PLAYER_ADDRESS,
  dice,
  increaseTime,
  manager,
  mineBlocks,
  playerEnter,
  publicClient,
} from '../support/chain'

const ENTRY = 10n ** 16n

async function expectRefundedToPlayer(startBalance: bigint) {
  const after = await publicClient.getBalance({ address: PLAYER_ADDRESS })
  expect(startBalance - after).toBeLessThan(10n ** 15n)
  expect(await manager.read('invariantHolds')).toBe(true)
}

test.describe('refund and escape paths', () => {
  test('refunds the randomness fee, cancels, and returns the entry', async ({
    page,
    installWallet,
  }) => {
    const start = await publicClient.getBalance({ address: PLAYER_ADDRESS })
    await playerEnter([4], ENTRY)
    await increaseTime(61)
    await manager.write('lock')
    await manager.write('requestRandomness')

    await installWallet()
    await page.goto('/mine')
    await connect(page)
    await expect(page.getByRole('heading', { name: 'Randomness pending' })).toBeVisible()

    await mineBlocks(10)
    await openOps(page)
    await keeperButton(page, 'Refund randomness fee').click()
    await keeperButton(page, 'Cancel and refund deploys').click()
    await openMine(page)
    await expect(page.getByRole('heading', { name: 'Round cancelled' })).toBeVisible()
    await keeperButton(page, /^Claim refund/).click()
    await expect(keeperButton(page, /^Claim refund/)).toBeHidden()

    await expectRefundedToPlayer(start)
  })

  test('lets anyone cancel a locked round whose randomness request keeps failing', async ({
    page,
    installWallet,
    syncBrowserClock,
  }) => {
    const start = await publicClient.getBalance({ address: PLAYER_ADDRESS })
    await playerEnter([6], ENTRY)
    await increaseTime(61)
    await manager.write('lock')
    await dice.failRequests(true)

    await installWallet()
    await syncBrowserClock()
    await openOps(page)
    await expect(keeperButton(page, 'Request randomness')).toBeVisible()
    await expect(
      page.getByText(/anyone can cancel this round and refund every deploy in/),
    ).toBeVisible()
    await expect(keeperButton(page, 'Cancel round and refund deploys')).toBeHidden()

    await increaseTime(3600)
    await page.clock.fastForward(3600 * 1000)
    await keeperButton(page, 'Cancel round and refund deploys').click()
    await openMine(page)
    await expect(page.getByRole('heading', { name: 'Round cancelled' })).toBeVisible()
    await keeperButton(page, /^Claim refund/).click()
    await expect(keeperButton(page, /^Claim refund/)).toBeHidden()

    await expectRefundedToPlayer(start)
  })

  test('lets anyone cancel a pending round after the timeout when the provider refund fails', async ({
    page,
    installWallet,
    syncBrowserClock,
  }) => {
    const start = await publicClient.getBalance({ address: PLAYER_ADDRESS })
    await playerEnter([8], ENTRY)
    await increaseTime(61)
    await manager.write('lock')
    await manager.write('requestRandomness')
    await dice.failRefunds(true)

    await installWallet()
    await syncBrowserClock()
    await openOps(page)
    await expect(keeperButton(page, 'Refund randomness fee')).toBeVisible()
    await expect(
      page.getByText(/anyone can cancel this round and refund every deploy in/),
    ).toBeVisible()

    await increaseTime(86_400)
    await page.clock.fastForward(86_400 * 1000)
    await keeperButton(page, 'Cancel and refund deploys').click()
    await openMine(page)
    await expect(page.getByRole('heading', { name: 'Round cancelled' })).toBeVisible()
    await keeperButton(page, /^Claim refund/).click()
    await expect(keeperButton(page, /^Claim refund/)).toBeHidden()

    await expectRefundedToPlayer(start)
  })
})
