import { test, expect } from './fixtures'
import { connect } from '../support/ui'
import {
  KEEPER_SECRET,
  dice,
  findOutput,
  increaseTime,
  manager,
  playerEnter,
} from '../support/chain'

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

const WIN_SQUARE = 4

/** Computed look of a block button: its scale and its box shadow. */
async function cellLook(locator: import('@playwright/test').Locator) {
  return locator.evaluate((node) => {
    const style = getComputedStyle(node)
    // Tailwind writes scale-* as the CSS `scale` property ("none" or "1.06"), not as a transform.
    const scale = style.scale === 'none' ? 1 : Number(style.scale.split(' ')[0])
    return { scale, shadow: style.boxShadow }
  })
}
/** Runs a full round through the keeper route while the page is open on it. */
async function endRoundWhileWatching(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
) {
  await playerEnter([WIN_SQUARE, 9], 10n ** 15n)
  const id = (await manager.read('currentRoundId')) as bigint
  await page.goto('/mine')
  await connect(page)
  await expect(page.getByText(`Round #${id}`, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Block 4,/ })).toContainText('0.001')
  await increaseTime(61)
  const oracle = fulfillWhenRequested(id, WIN_SQUARE)
  const response = await request.post('/api/keeper', { headers })
  await oracle
  expect(response.status()).toBe(200)
  return id
}

test.describe('winner landing and hold', () => {
  test.beforeEach(async ({ installWallet }) => {
    await installWallet()
  })

  test('lands on the winning block, holds it, withholds the claim, then shows the next round', async ({
    page,
    request,
  }) => {
    // The block lit by the scan glows while the reveal runs: a block with an outer shadow before any
    // block is marked as the winner, so the winner cannot satisfy this on its own.
    const scanGlow = page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[aria-label="5 by 5 mining grid"] button')).some(
          (button) => {
            if (button.getAttribute('aria-label')?.includes('winning block')) return false
            const shadow = getComputedStyle(button).boxShadow
            return shadow !== 'none' && !shadow.includes('inset')
          },
        ),
      null,
      { timeout: 40_000 },
    )
    const id = await endRoundWhileWatching(page, request)
    const winning = page.getByRole('button', { name: /^Block 4,.*winning block/ })

    // The page polls every 5 s, so the reveal starts within a poll of the keeper call.
    await expect(winning).toBeVisible({ timeout: 25_000 })
    const holdStarted = Date.now()
    await scanGlow
    // The winner is larger than a normal block and glows; a neighbor is not and does not.
    const win = await cellLook(winning)
    expect(win.scale).toBeGreaterThan(1.03)
    expect(win.shadow).not.toBe('none')
    await page.screenshot({ path: 'test-results/reveal-hold.png' })
    const neighbor = await cellLook(page.getByRole('button', { name: /^Block 5,/ }))
    expect(neighbor.scale).toBe(1)
    expect(neighbor.shadow).toBe('none')
    await page.screenshot({ path: 'test-results/reveal-hold.png', fullPage: true })
    await expect(page.getByText(`Round #${id}`, { exact: true })).toBeVisible()
    await expect(page.getByText('Winning block: 4')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Claim/ })).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'winning block 4' })).toBeAttached()
    // Entries wait for the end of the reveal: the grid, the presets, and the stepper are locked.
    await expect(page.getByRole('button', { name: /^Block 5,/ })).toBeDisabled()
    await expect(page.getByRole('button', { name: /^Odd/ })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeDisabled()

    // The hold ends, the next round takes over, and the reward can be claimed.
    await expect(winning).toBeHidden({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /^Odd/ })).toBeEnabled()
    // The hold is 3.6 s; a little is lost to the screenshot and the polling of the assertions.
    expect(Date.now() - holdStarted).toBeGreaterThan(3000)
    await expect(page.getByText(`Round #${id + 1n}`, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Claim/ }).first()).toBeVisible()
  })

  test('with reduced motion there is no scan and the winner still holds', async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await endRoundWhileWatching(page, request)
    const winning = page.getByRole('button', { name: /^Block 4,.*winning block/ })
    await expect(winning).toBeVisible({ timeout: 25_000 })
    await expect(page.getByRole('button', { name: /^Claim/ })).toHaveCount(0)
    const look = await cellLook(winning)
    expect(look.scale).toBeGreaterThan(1.03)
    expect(look.shadow).not.toBe('none')
    await expect(winning).toBeHidden({ timeout: 15_000 })
  })

  test('a page opened after the round ended replays nothing', async ({ page, request }) => {
    await playerEnter([WIN_SQUARE], 10n ** 15n)
    const id = (await manager.read('currentRoundId')) as bigint
    await increaseTime(61)
    const oracle = fulfillWhenRequested(id, WIN_SQUARE)
    await request.post('/api/keeper', { headers })
    await oracle

    await page.goto('/mine')
    await connect(page)
    await expect(page.getByText(`Round #${id + 1n}`, { exact: true })).toBeVisible()
    await page.waitForTimeout(1500)
    await expect(page.getByRole('button', { name: /winning block/ })).toHaveCount(0)
  })

  test('fits a 360 px screen during the hold', async ({ page, request }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await endRoundWhileWatching(page, request)
    const winning = page.getByRole('button', { name: /^Block 4,.*winning block/ })
    await expect(winning).toBeVisible({ timeout: 25_000 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    await page.screenshot({ path: 'test-results/reveal-hold-360.png', fullPage: true })
  })

  test('a tab that returns after the round ended gets no replay', async ({ page, request }) => {
    await page.addInitScript(() => {
      const state = { hidden: false }
      Object.defineProperty(window, '__tab', { value: state })
      Object.defineProperty(document, 'visibilityState', {
        get: () => (state.hidden ? 'hidden' : 'visible'),
      })
    })
    await playerEnter([WIN_SQUARE, 9], 10n ** 15n)
    const id = (await manager.read('currentRoundId')) as bigint
    await page.goto('/mine')
    await connect(page)
    await expect(page.getByText(`Round #${id}`, { exact: true })).toBeVisible()

    await page.evaluate(() => {
      ;(window as unknown as { __tab: { hidden: boolean } }).__tab.hidden = true
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await increaseTime(61)
    const oracle = fulfillWhenRequested(id, WIN_SQUARE)
    await request.post('/api/keeper', { headers })
    await oracle
    await page.evaluate(() => {
      ;(window as unknown as { __tab: { hidden: boolean } }).__tab.hidden = false
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await expect(page.getByText(`Round #${id + 1n}`, { exact: true })).toBeVisible({
      // A reveal would hold the old round for at least 6 s (scan 2.4 s plus hold 3.6 s).
      timeout: 4_500,
    })
    await expect(page.getByRole('button', { name: /winning block/ })).toHaveCount(0)
  })
  test('a cancelled round gets no landing', async ({ page, request }) => {
    await playerEnter([WIN_SQUARE, 9], 10n ** 15n)
    const id = (await manager.read('currentRoundId')) as bigint
    await page.goto('/mine')
    await connect(page)
    await expect(page.getByText(`Round #${id}`, { exact: true })).toBeVisible()

    // The oracle refuses the request, so the round stays locked until it is cancelled.
    await dice.failRequests(true)
    await increaseTime(61)
    await request.post('/api/keeper', { headers })
    await expect(page.getByText('Round closed').first()).toBeVisible({ timeout: 25_000 })
    await increaseTime(3601)
    await manager.write('cancelRound', [id])
    await request.post('/api/keeper', { headers })

    await expect(page.getByText(`Round #${id + 1n}`, { exact: true })).toBeVisible({
      // Without the cancelled shortcut the page would wait 15 s for a result that never comes.
      timeout: 9_000,
    })
    await expect(page.getByRole('button', { name: /winning block/ })).toHaveCount(0)
  })

  test('every lit timer segment glows, and an unlit one does not', async ({
    page,
    syncBrowserClock,
  }) => {
    // Enter first: earlier tests moved the chain clock ahead, so the browser clock is set from the
    // block of this entry, whose time is the start of the countdown.
    await playerEnter([WIN_SQUARE], 10n ** 15n)
    await syncBrowserClock()
    await page.goto('/mine')
    await connect(page)
    const segments = page.locator('[aria-hidden="true"].flex.h-2 > i')
    await expect(segments).toHaveCount(30)
    // Let a few seconds run, so that both lit and unlit segments exist. The page's own timers are
    // faked, so each step moves its clock and then gives React a moment to render.
    const readLooks = () =>
      segments.evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).boxShadow !== 'none'),
      )
    let looks = await readLooks()
    for (let step = 0; step < 20 && looks.every(Boolean); step += 1) {
      await page.clock.runFor(1_000)
      await page.waitForTimeout(100)
      looks = await readLooks()
    }
    const lit = looks.filter(Boolean).length
    expect(lit).toBeGreaterThan(20)
    expect(lit).toBeLessThan(30)
    // Lit segments come first, with no gap: every one of them glows, and no unlit one does.
    expect(looks.slice(0, lit).every(Boolean)).toBe(true)
    expect(looks.slice(lit).some(Boolean)).toBe(false)
    const bar = await segments.first().locator('xpath=..').boundingBox()
    if (bar) {
      await page.screenshot({
        path: 'test-results/timer-glow.png',
        clip: { x: bar.x - 16, y: bar.y - 40, width: bar.width + 32, height: 70 },
      })
    }
  })
})
