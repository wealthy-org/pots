import { test, expect } from '../e2e/fixtures'
import { connect, selectSquares, setAmount } from '../support/ui'
import {
  KEEPER_SECRET,
  PLAYER_ADDRESS,
  increaseTime,
  manager,
  plan,
  playerEnter,
  publicClient,
} from '../support/chain'
import type { Page } from '@playwright/test'

const headers = { authorization: `Bearer ${KEEPER_SECRET}` }
const AMOUNT = 10n ** 15n

type PlanView = { roundsRemaining: number; balance: bigint; active: boolean; loop: boolean }

async function playerPlan(): Promise<PlanView> {
  return (await plan.read('getPlan', [PLAYER_ADDRESS])) as PlanView
}

async function currentRoundId(): Promise<bigint> {
  return (await manager.read('currentRoundId')) as bigint
}

/** Starts a plan of `rounds` rounds on blocks 1 and 2 through the Mine page. */
async function startPlanThroughUi(page: Page, rounds: number, options: { loop?: boolean } = {}) {
  await page.goto('/mine')
  await connect(page)
  await page.getByRole('button', { name: 'Auto', exact: true }).click()
  await selectSquares(page, [1, 2])
  await setAmount(page, '0.001')
  const more = page.getByRole('button', { name: 'More rounds' })
  for (let value = 5; value < rounds; value += 1) {
    await more.click()
  }
  if (options.loop) {
    await page.getByRole('switch', { name: 'Loop rewards' }).click()
  }
  await page.getByRole('button', { name: /^Start auto/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Review auto plan' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function confirmPlan(page: Page, rounds: number, options: { loop?: boolean } = {}) {
  const dialog = await startPlanThroughUi(page, rounds, options)
  await dialog.getByRole('button', { name: 'Confirm in wallet' }).click()
  await expect(page.getByRole('region', { name: 'Your auto plan' })).toBeVisible()
}

test.describe('auto plans', () => {
  test.beforeEach(async ({ installWallet }) => {
    await installWallet()
  })

  test('creates a plan, lets the keeper enter the round, and counts the rounds down', async ({
    page,
    request,
  }) => {
    const dialog = await startPlanThroughUi(page, 5)
    await expect(dialog).toContainText(/Pay now\s*0\.01 ETH/)
    await expect(dialog).toContainText(/Minimum plan\s*0\.01 ETH/)
    await dialog.getByRole('button', { name: 'Confirm in wallet' }).click()

    const status = page.getByRole('region', { name: 'Your auto plan' })
    await expect(status).toBeVisible()
    await expect(status.getByText('Running')).toBeVisible()
    expect((await playerPlan()).roundsRemaining).toBe(5)

    const roundId = await currentRoundId()
    const response = await request.post('/api/keeper', { headers })
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.actions.map((action: { name: string }) => action.name)).toContain('executePlans')
    expect(body.plans).toEqual({ active: '1', pending: '0' })
    expect(JSON.stringify(body)).not.toContain(KEEPER_SECRET)

    expect(await manager.read('getEntry', [roundId, 1, PLAYER_ADDRESS])).toBe(AMOUNT)
    expect(await manager.read('getEntry', [roundId, 2, PLAYER_ADDRESS])).toBe(AMOUNT)
    const after = await playerPlan()
    expect(after.roundsRemaining).toBe(4)
    expect(after.balance).toBe(8n * AMOUNT)

    await page.reload()
    await connect(page)
    await expect(
      page.getByRole('region', { name: 'Your auto plan' }).getByText('4', { exact: true }),
    ).toBeVisible()
  })

  test('stop auto returns the unspent balance', async ({ page }) => {
    await confirmPlan(page, 5)
    const before = await publicClient.getBalance({ address: PLAYER_ADDRESS })
    await page.getByRole('button', { name: /^Stop auto/ }).click()
    await expect(page.getByRole('button', { name: /^Start auto/ })).toBeVisible()

    const after = await playerPlan()
    expect(after.active).toBe(false)
    expect(after.balance).toBe(0n)
    const returned = (await publicClient.getBalance({ address: PLAYER_ADDRESS })) - before
    expect(returned).toBeGreaterThan(9n * 10n ** 15n)
  })

  test('loop asks for the consent first, then the plan', async ({ page }) => {
    const dialog = await startPlanThroughUi(page, 5, { loop: true })
    await expect(dialog.getByText(/two confirmations/)).toBeVisible()
    expect(await manager.read('planClaimConsent', [PLAYER_ADDRESS])).toBe(false)
    await dialog.getByRole('button', { name: 'Confirm in wallet' }).click()
    await expect(page.getByRole('region', { name: 'Your auto plan' })).toBeVisible()

    expect(await manager.read('planClaimConsent', [PLAYER_ADDRESS])).toBe(true)
    expect((await playerPlan()).loop).toBe(true)
  })

  test('a paused manager visits no plan, and the owner of the plan can still exit', async ({
    page,
    request,
  }) => {
    await confirmPlan(page, 5)
    await manager.write('pause')

    const response = await request.post('/api/keeper', { headers })
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.actions.filter((a: { name: string }) => a.name === 'executePlans')).toHaveLength(1)
    expect((await playerPlan()).roundsRemaining).toBe(5)

    await page.getByRole('button', { name: /^Stop auto/ }).click()
    await expect(page.getByRole('button', { name: /^Start auto/ })).toBeVisible()
    expect((await playerPlan()).balance).toBe(0n)
  })

  test('a plan is skipped for a round that already closed', async ({ page }) => {
    await confirmPlan(page, 5)
    await playerEnter([5], AMOUNT)
    await increaseTime(61)

    await plan.write('executePlans', [20n])
    const after = await playerPlan()
    expect(after.roundsRemaining).toBe(5)
    expect(after.balance).toBe(10n * AMOUNT)
  })

  test('fits a 360 px screen with 44 px targets, before and after a plan starts', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto('/mine')
    await connect(page)
    await page.getByRole('button', { name: 'Auto', exact: true }).click()
    await selectSquares(page, [1, 2])

    const check = async (names: Array<string | RegExp>) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
      for (const name of names) {
        const box = await page.getByRole('button', { name }).first().boundingBox()
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5)
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(43.5)
      }
      const toggle = await page.getByRole('switch', { name: 'Loop rewards' }).boundingBox()
      expect(toggle?.height ?? 0).toBeGreaterThanOrEqual(43.5)
    }

    await check(['Fewer rounds', 'More rounds', '25', /^Start auto/])
    await page.screenshot({ path: 'test-results/plan-360-controls.png', fullPage: true })

    await setAmount(page, '0.001')
    await page.getByRole('button', { name: /^Start auto/ }).click()
    await page
      .getByRole('dialog', { name: 'Review auto plan' })
      .getByRole('button', { name: 'Confirm in wallet' })
      .click()
    await expect(page.getByRole('region', { name: 'Your auto plan' })).toBeVisible()
    await check([/^Stop auto/])
    await page.screenshot({ path: 'test-results/plan-360-status.png', fullPage: true })
  })
})
