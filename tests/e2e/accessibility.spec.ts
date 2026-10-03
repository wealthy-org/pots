import { test, expect } from './fixtures'
import { connect, selectSquares } from '../support/ui'

test.describe('accessibility regressions (360 px)', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test('Mine has a page heading and a persistent phase announcement', async ({
    page,
    installWallet,
  }) => {
    await installWallet()
    await page.goto('/mine')

    await expect(page.getByRole('heading', { level: 1, name: 'Mine' })).toHaveCount(1)
    const status = page.getByRole('status').filter({ hasText: /^Round \d+:/ })
    await expect(status).toHaveText(/Round 1: /)
    await expect(status).toHaveAttribute('aria-live', 'polite')
  })

  test('primary touch targets are at least 44 px', async ({ page, installWallet }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)

    const logo = await page.getByRole('link', { name: 'POTS home' }).boundingBox()
    expect(logo?.height).toBeGreaterThanOrEqual(44)
    const input = await page.getByLabel('Amount per block').boundingBox()
    expect(input?.height).toBeGreaterThanOrEqual(44)
  })

  test('the review dialog is labelled by its title', async ({ page, installWallet }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)
    await selectSquares(page, [3])
    await page.getByRole('button', { name: /^MINE/ }).click()

    await expect(page.getByRole('dialog', { name: 'Review deploy' })).toBeVisible()
  })

  test('no element extends past the viewport on any page', async ({ page, installWallet }) => {
    await installWallet()
    for (const path of ['/mine', '/history', '/stats', '/token']) {
      await page.goto(path)
      await page.waitForTimeout(1500)
      const overflowing = await page.evaluate(() => {
        const width = window.innerWidth
        return [...document.querySelectorAll('body *')]
          .filter((element) => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return (
              rect.width > 0 &&
              style.position !== 'fixed' &&
              style.display !== 'none' &&
              (rect.right > width + 1 || rect.left < -1)
            )
          })
          .map((element) => element.tagName.toLowerCase())
      })
      expect(overflowing, `${path} overflows`).toEqual([])
    }
  })
})
