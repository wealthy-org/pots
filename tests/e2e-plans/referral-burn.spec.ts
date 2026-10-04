import { test, expect } from '../e2e/fixtures'
import { connect, reviewEntry, selectSquares, setAmount } from '../support/ui'
import {
  KEEPER_SECRET,
  OWNER_ADDRESS,
  PLAYER_ADDRESS,
  dice,
  findOutput,
  increaseTime,
  manager,
  playerEnter,
  playerManager,
  potsBalance,
  tokenRead,
} from '../support/chain'

const ZERO = '0x0000000000000000000000000000000000000000'
const headers = { authorization: `Bearer ${KEEPER_SECRET}` }

type RoundView = { phase: number; randomnessRequestId: bigint }

/** Plays the Dice oracle once the keeper has requested randomness. */
async function fulfillWhenRequested(roundId: bigint, square: number): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const round = (await manager.read('getRound', [roundId])) as RoundView
    if (round.phase === 4 && round.randomnessRequestId > 0n) {
      await dice.fulfill(round.randomnessRequestId, findOutput(square))
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('the keeper never requested randomness')
}

test.describe('referral', () => {
  test.beforeEach(async ({ installWallet }) => {
    await installWallet()
  })

  test('a first deploy through a link sends enterWithReferrer and tags the wallet', async ({
    page,
  }) => {
    await page.goto(`/mine?ref=${OWNER_ADDRESS}`)
    await connect(page)
    await page.getByRole('button', { name: 'Manual', exact: true }).click()
    await selectSquares(page, [3])
    await setAmount(page, '0.001')
    const dialog = await reviewEntry(page)
    await expect(dialog).toContainText('Referred by')
    await expect(dialog).toContainText(OWNER_ADDRESS)
    await dialog.getByRole('button', { name: 'Confirm in wallet' }).click()
    await expect(page.getByText('Deployed', { exact: true })).toBeVisible()
    expect(await manager.read('referrerOf', [PLAYER_ADDRESS])).toBe(OWNER_ADDRESS)
  })

  test('an ordinary deploy sends enter and leaves the wallet untagged', async ({ page }) => {
    await page.goto('/mine')
    await connect(page)
    await page.getByRole('button', { name: 'Manual', exact: true }).click()
    await selectSquares(page, [3])
    await setAmount(page, '0.001')
    const dialog = await reviewEntry(page)
    await expect(dialog).not.toContainText('Referred by')
    await dialog.getByRole('button', { name: 'Confirm in wallet' }).click()
    await expect(page.getByText('Deployed', { exact: true })).toBeVisible()
    expect(await manager.read('referrerOf', [PLAYER_ADDRESS])).toBe(ZERO)
  })

  test('a wallet that already deployed is not offered a referrer', async ({ page }) => {
    await playerEnter([3], 10n ** 15n)
    await page.goto(`/mine?ref=${OWNER_ADDRESS}`)
    await connect(page)
    await page.getByRole('button', { name: 'Manual', exact: true }).click()
    await selectSquares(page, [4])
    await setAmount(page, '0.001')
    const dialog = await reviewEntry(page)
    await expect(dialog).not.toContainText('Referred by')

    await page.goto('/referrals')
    await connect(page)
    await expect(page.getByText(/you have already deployed/)).toBeVisible()
    await expect(page.getByLabel('Set a referrer')).toHaveCount(0)
  })

  test('the Referrals page shows the link and sets a referrer for a new wallet', async ({
    page,
  }) => {
    await page.goto('/referrals')
    await connect(page)
    await expect(page.getByText(`/mine?ref=${PLAYER_ADDRESS}`)).toBeVisible()

    const input = page.getByLabel('Set a referrer')
    await input.fill(PLAYER_ADDRESS)
    await expect(page.getByText('You cannot refer yourself.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Set referrer/ })).toBeDisabled()

    await input.fill('0x123')
    await expect(page.getByText('Enter a valid wallet address.')).toBeVisible()

    await input.fill(OWNER_ADDRESS)
    await page.getByRole('button', { name: /^Set referrer/ }).click()
    await expect(page.getByText('Referrer set.')).toBeVisible()
    expect(await manager.read('referrerOf', [PLAYER_ADDRESS])).toBe(OWNER_ADDRESS)
    await expect(page.getByLabel('Set a referrer')).toHaveCount(0)
  })
})

test.describe('referral bonus and burn', () => {
  test.beforeEach(async ({ installWallet }) => {
    await installWallet()
  })

  /** Settles a round the player won, so the player holds POTS. */
  async function winOneRound(request: import('@playwright/test').APIRequestContext) {
    await playerManager.write('setReferrer', [OWNER_ADDRESS])
    await playerEnter([4], 10n ** 15n)
    await increaseTime(61)
    const roundId = (await manager.read('currentRoundId')) as bigint
    const oracle = fulfillWhenRequested(roundId, 4)
    const response = await request.post('/api/keeper', { headers })
    await oracle
    expect(response.status()).toBe(200)
    await playerManager.write('claimPots', [roundId])
  }

  test('a claim mints 1% to the referrer on top of the reward', async ({ request }) => {
    const before = await potsBalance(OWNER_ADDRESS)
    await winOneRound(request)
    expect(await potsBalance(PLAYER_ADDRESS)).toBe(10n ** 18n)
    expect((await potsBalance(OWNER_ADDRESS)) - before).toBe(10n ** 16n)
    expect(await tokenRead('totalMinted')).toBe(10n ** 18n + 10n ** 16n)
  })

  test('burn lowers the supply and never the amount ever minted', async ({ page, request }) => {
    await winOneRound(request)
    const supplyBefore = await tokenRead('totalSupply')
    const mintedBefore = await tokenRead('totalMinted')

    await page.goto('/token')
    await connect(page)
    await expect(page.getByText('Total ever minted')).toBeVisible()
    await page.getByLabel('Amount to burn').fill('2')
    await expect(page.getByText('That is more than your POTS balance.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Burn POTS' })).toBeDisabled()

    await page.getByLabel('Amount to burn').fill('0.4')
    await expect(page.getByText('Total supply after')).toBeVisible()
    await page.getByRole('button', { name: 'Burn POTS' }).click()
    const dialog = page.getByRole('dialog', { name: 'Confirm burn' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Burn in wallet' }).click()
    await expect(dialog).toBeHidden()

    expect(await potsBalance(PLAYER_ADDRESS)).toBe(6n * 10n ** 17n)
    expect(await tokenRead('totalSupply')).toBe(supplyBefore - 4n * 10n ** 17n)
    expect(await tokenRead('totalMinted')).toBe(mintedBefore)
  })
})

test.describe('referral and token pages at 360 px', () => {
  test('fit the screen and keep 44 px targets', async ({ page, installWallet }) => {
    await installWallet()
    await page.setViewportSize({ width: 360, height: 740 })

    for (const path of ['/referrals', '/token']) {
      await page.goto(path)
      await connect(page)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
      const small = await page.evaluate(
        () =>
          Array.from(document.querySelectorAll('main button, main input, main a'))
            .map((node) => node.getBoundingClientRect())
            .filter((box) => box.width > 0 && (box.height < 43.5 || box.width < 43.5)).length,
      )
      expect(small).toBe(0)
      await page.screenshot({ path: `test-results/v3-360-${path.slice(1)}.png`, fullPage: true })
    }
  })
})
