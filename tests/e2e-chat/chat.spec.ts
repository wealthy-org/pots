import { neon } from '@neondatabase/serverless'
import { test, expect } from '../e2e/fixtures'
import { connect } from '../support/ui'
import { setWalletMode } from '../support/wallet'
import { PLAYER_ADDRESS } from '../support/chain'

const wallet = PLAYER_ADDRESS.toLowerCase()
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null

async function cleanRows() {
  if (!sql) return
  await sql`delete from chat_messages where wallet = ${wallet}`
  await sql`delete from profiles where wallet = ${wallet}`
}

test.describe('chat', () => {
  test.skip(!sql, 'DATABASE_URL (the Neon dev branch) is not loaded: run npm run e2e:chat')

  test.beforeAll(cleanRows)
  test.afterAll(cleanRows)
  test.beforeEach(async ({ installWallet }) => {
    await installWallet()
  })

  async function openChat(page: import('@playwright/test').Page) {
    await page.goto('/mine')
    await connect(page)
    await page.getByRole('button', { name: 'Chat', exact: true }).click()
    return page.getByRole('dialog', { name: 'Chat' })
  }

  async function signIn(dialog: import('@playwright/test').Locator) {
    await dialog.getByRole('button', { name: 'Sign in to chat' }).click()
    await expect(dialog.getByLabel('Message', { exact: true })).toBeVisible()
  }

  test('signs in once, posts plain text, and keeps the session after a reload', async ({
    page,
  }) => {
    const dialog = await openChat(page)
    await expect(dialog.getByText('Clears every day at 00:00 UTC')).toBeVisible()
    // The live log exists from the start, so the first message is announced too.
    await expect(dialog.getByRole('log')).toBeAttached()
    await expect(
      dialog.getByText('Signing proves you own the wallet. It costs no gas.'),
    ).toBeVisible()
    await signIn(dialog)

    const unique = `hello ${Date.now()}`
    await dialog
      .getByLabel('Message', { exact: true })
      .fill(`${unique} <img src=x onerror=alert(1)> https://evil.test`)
    await expect(dialog.getByText(/\d+\/280/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Send message' }).click()

    const log = dialog.getByRole('log')
    await expect(log).toContainText(unique)
    await expect(log).toContainText('<img src=x onerror=alert(1)>')
    expect(await log.locator('img, a').count()).toBe(0)
    await page.screenshot({ path: 'test-results/chat-desktop.png' })
    await expect(log).toContainText(`${wallet.slice(0, 6)}...${wallet.slice(-4)}`)

    await page.reload()
    await connect(page)
    await page.getByRole('button', { name: 'Chat', exact: true }).click()
    const again = page.getByRole('dialog', { name: 'Chat' })
    await expect(again.getByLabel('Message', { exact: true })).toBeVisible()
    await expect(again.getByRole('log')).toContainText(unique)
  })

  test('sets, shows, and removes a nickname, and refuses reserved names', async ({ page }) => {
    const dialog = await openChat(page)
    await signIn(dialog)
    await dialog.getByRole('button', { name: 'Set nickname' }).click()
    await dialog.getByLabel('3 to 16 letters, digits, or underscores').fill('Admin')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByRole('alert')).toContainText('Reserved')

    await dialog.getByLabel('3 to 16 letters, digits, or underscores').fill('Test_Alice')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByText('Test_Alice').first()).toBeVisible()

    await dialog.getByLabel('Message', { exact: true }).fill('named message')
    await dialog.getByRole('button', { name: 'Send message' }).click()
    await expect(dialog.getByRole('log')).toContainText('Test_Alice')

    await dialog.getByRole('button', { name: 'Change' }).click()
    await dialog.getByRole('button', { name: 'Remove nickname' }).click()
    await expect(dialog.getByText('No nickname: your address is shown')).toBeVisible()
  })

  test('explains a rejected signature and keeps the sign-in button', async ({ page }) => {
    const dialog = await openChat(page)
    await setWalletMode(page, 'reject')
    await dialog.getByRole('button', { name: 'Sign in to chat' }).click()
    await expect(dialog.getByRole('alert')).toContainText('Signature rejected')
    await expect(dialog.getByRole('button', { name: 'Sign in to chat' })).toBeVisible()
  })

  test('a chat outage leaves the game working', async ({ page }) => {
    await page.route('**/api/chat/messages**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"CHAT_UNAVAILABLE"}',
      }),
    )
    const dialog = await openChat(page)
    await expect(dialog.getByText('Chat is unavailable right now.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Block 1,/ })).toBeVisible()
  })

  test('clears the list when the UTC day changes', async ({ page }) => {
    let calls = 0
    await page.route('**/api/chat/messages**', (route) => {
      calls += 1
      const first = calls === 1
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          day: first ? '2026-10-05' : '2026-10-06',
          messages: first
            ? [
                {
                  id: '1',
                  wallet,
                  nickname: null,
                  body: 'yesterday talk',
                  createdAt: new Date().toISOString(),
                },
              ]
            : [],
        }),
      })
    })
    const dialog = await openChat(page)
    await expect(dialog.getByRole('log')).toContainText('yesterday talk')
    await expect(
      dialog.getByText('No messages today. Chat clears every day at 00:00 UTC.'),
    ).toBeVisible({
      timeout: 15_000,
    })
  })

  test('fits a 360 px screen as a bottom sheet with 44 px targets, opened from the bottom bar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto('/mine')
    await connect(page)
    await page
      .getByRole('navigation', { name: 'Primary mobile' })
      .getByRole('button', { name: 'Chat', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Chat' })
    await expect(dialog).toBeVisible()
    await signIn(dialog)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    for (const name of ['Close chat', 'Send message', 'Set nickname']) {
      const box = await dialog.getByRole('button', { name }).first().boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5)
    }
    await page.screenshot({ path: 'test-results/chat-360.png', fullPage: false })
    // With the nickname form open the sheet still shows every control inside the screen.
    await dialog.getByRole('button', { name: 'Set nickname' }).click()
    const field = dialog.getByLabel('3 to 16 letters, digits, or underscores')
    await expect(field).toBeVisible()
    for (const locator of [
      field,
      dialog.getByRole('button', { name: 'Save' }),
      dialog.getByLabel('Message', { exact: true }),
    ]) {
      const box = await locator.boundingBox()
      expect(
        box && box.y >= 0 && box.y + box.height <= 740 && box.x >= 0 && box.x + box.width <= 360,
      ).toBe(true)
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5)
    }
    await page.screenshot({ path: 'test-results/chat-360-nickname.png', fullPage: false })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    // The focus goes back to what opened the panel (the Chat button of the tab bar).
    await expect(
      page
        .getByRole('navigation', { name: 'Primary mobile' })
        .getByRole('button', { name: 'Chat' }),
    ).toBeFocused()
  })

  test('Chat sits at the top of the rail from 1024 px, and in the bottom bar below it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 })
    await openChat(page)
    await page.keyboard.press('Escape')
    const rail = page.getByRole('complementary', { name: 'Quick actions' })
    const chat = await rail.getByRole('button', { name: 'Chat' }).boundingBox()
    const fairness = await rail.getByRole('link', { name: 'Fairness' }).boundingBox()
    // Under the 64 px header, above the page links, 48 px square.
    expect(chat?.y ?? 0).toBeGreaterThan(64)
    expect(chat?.y ?? 0).toBeLessThan(100)
    expect(chat?.width).toBe(48)
    expect(chat?.height).toBe(48)
    expect(chat?.y ?? 999).toBeLessThan(fairness?.y ?? 0)

    for (const width of [1023, 820, 360]) {
      await page.setViewportSize({ width, height: 900 })
      const bar = page.getByRole('navigation', { name: 'Primary mobile' })
      await expect(bar.getByRole('button')).toHaveText(['Chat', 'More'])
      const labels = await bar.locator('a, button').allInnerTexts()
      expect(labels.map((text) => text.trim())).toEqual([
        'Mine',
        'Token',
        'Stats',
        'History',
        'Chat',
        'More',
      ])
    }
  })
})
