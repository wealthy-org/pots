import { test, expect } from './fixtures'
import { connect } from '../support/ui'
import { dice, findOutput, increaseTime, manager, playerEnter } from '../support/chain'

const PAGES = [
  { path: '/docs', heading: 'Docs' },
  { path: '/fairness', heading: 'Fairness' },
  { path: '/contracts', heading: 'Contracts' },
  { path: '/about', heading: 'About' },
  { path: '/terms', heading: 'Terms' },
  { path: '/privacy', heading: 'Privacy' },
  { path: '/profile', heading: 'Profile' },
]

test.describe('mine.html layout parity', () => {
  test('the header follows the prototype: nav order, network chip, balances, menu', async ({
    page,
    installWallet,
  }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)

    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav.getByRole('link')).toHaveText(['Mine', 'Token', 'Stats', 'History'])
    const header = page.getByRole('banner')
    await expect(header.getByTitle(/^Network/)).toContainText('Anvil Local')
    await expect(header.getByTitle('ETH balance')).toContainText(/\d/)
    await expect(header.getByTitle('POTS balance')).toContainText(/\d/)
    await expect(page.getByRole('button', { name: /^Start / })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Chat' })).toHaveCount(0)
  })

  test('the rail and the footer links lead to real pages, and 18+ is plain text', async ({
    page,
    installWallet,
  }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)

    const rail = page.getByRole('complementary', { name: 'Quick actions' })
    await expect(rail.getByRole('link')).toHaveCount(3)
    await expect(rail.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs')
    await expect(rail.getByRole('link', { name: 'Fairness' })).toHaveAttribute('href', '/fairness')
    await expect(rail.getByRole('link', { name: 'Contracts' })).toHaveAttribute(
      'href',
      '/contracts',
    )

    const footer = page.getByRole('navigation', { name: 'Footer' })
    await expect(footer.getByRole('link')).toHaveText(['About', 'Token', 'Terms', 'Privacy'])
    await expect(footer.getByText('18+', { exact: true })).toBeVisible()
    await expect(footer.getByRole('link', { name: '18+' })).toHaveCount(0)
  })

  test('the panel has the prototype controls: tabs, presets, stepper, summary, CTA, risk line', async ({
    page,
    installWallet,
  }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)

    await expect(page.getByRole('button', { name: 'Auto', pressed: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Odd/ })).toBeVisible()
    await page.getByRole('button', { name: 'Manual', pressed: false }).click()
    await expect(page.getByRole('button', { name: /^Odd/ })).toHaveCount(0)
    await expect(page.getByText('Tap blocks on the grid to add or remove them')).toBeVisible()

    await page.getByRole('button', { name: 'Add random block' }).click()
    await page.getByRole('button', { name: 'Add random block' }).click()
    await expect(page.getByText('2/25')).toBeVisible()
    await page.getByRole('button', { name: 'Remove block' }).click()
    await expect(page.getByText('1/25')).toBeVisible()
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await expect(page.getByText('25/25')).toBeVisible()
    await expect(page.getByText('25 selected')).toBeVisible()
    await expect(page.getByText('Total per round')).toBeVisible()
    await expect(page.getByRole('button', { name: /^MINE/ })).toBeEnabled()
    const deployPanel = page.getByRole('complementary', { name: 'Deploy panel' })
    await expect(deployPanel.getByText(/ETH deployed on blocks that do not win/)).toBeVisible()
    await expect(page.getByText('Randomness from a commit-reveal oracle.')).toBeVisible()
    await expect(page.getByText(/VRF/)).toHaveCount(0)
  })

  test('the timer shows the waiting state and the 30 segment bar', async ({
    page,
    installWallet,
  }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)
    await expect(page.getByText('Waiting for the first deploy').first()).toBeVisible()
    await expect(page.locator('div[aria-hidden="true"] > i')).toHaveCount(30)
  })

  test('the deploy shows on the grid with a you tag and heat, and the winners list shows the row', async ({
    page,
    installWallet,
  }) => {
    await playerEnter([3, 4], 10n ** 15n)
    await increaseTime(61)
    await manager.write('lock')
    await manager.write('requestRandomness')
    const round = (await manager.read('getRound', [1n])) as { randomnessRequestId: bigint }
    await dice.fulfill(round.randomnessRequestId, findOutput(3))
    await manager.write('settle', [1n])

    await installWallet()
    await page.goto('/mine')
    await connect(page)
    const block3 = page.getByRole('button', { name: /^Block 3,/ })
    await expect(block3).toHaveAccessibleName(/winning block/)
    await expect(block3).toHaveAccessibleName(/you 0\.001 ETH/)
    await expect(page.getByText('Winning block: 3')).toBeVisible()

    const winners = page.getByRole('region', { name: 'Recent winners' })
    await expect(winners.getByRole('button', { name: /Winners/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await expect(winners.getByText(/· 1 winner$/)).toBeVisible()
    await winners.getByRole('button', { name: /Winners/ }).click()
    await expect(winners.getByText('You', { exact: true })).toHaveCount(0)
  })
})

test.describe('information pages and profile', () => {
  for (const { path, heading } of PAGES) {
    test(`${path} opens with a heading and no horizontal overflow at 360 px`, async ({
      page,
      installWallet,
    }) => {
      await page.setViewportSize({ width: 360, height: 740 })
      await installWallet()
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
      expect(overflow).toBe(false)
    })
  }

  test('Terms and Privacy carry the draft status', async ({ page }) => {
    for (const path of ['/terms', '/privacy']) {
      await page.goto(path)
      await expect(page.getByRole('note')).toContainText('Draft pending legal review')
    }
  })

  test('the fairness page recomputes the winning block of a settled round', async ({
    page,
    installWallet,
  }) => {
    await playerEnter([9], 10n ** 15n)
    await increaseTime(61)
    await manager.write('lock')
    await manager.write('requestRandomness')
    const round = (await manager.read('getRound', [1n])) as { randomnessRequestId: bigint }
    await dice.fulfill(round.randomnessRequestId, findOutput(9))
    await manager.write('settle', [1n])

    await installWallet()
    await page.goto('/fairness')
    await expect(page.getByText('#9 (matches)')).toBeVisible()
    await expect(page.getByText('no hit (matches)')).toBeVisible()
  })

  test('the profile shows the totals of the connected wallet', async ({ page, installWallet }) => {
    await installWallet()
    await page.goto('/profile')
    await connect(page)
    await expect(page.getByText('No deploys yet')).toBeVisible()

    await playerEnter([5], 10n ** 15n)
    await page.goto('/profile')
    await connect(page)
    await expect(page.getByText('Rounds played')).toBeVisible()
    await expect(page.getByText('0.001 ETH').first()).toBeVisible()
  })

  const WIDTHS = [360, 800, 1024, 1440]
  for (const width of WIDTHS) {
    test(`every information page and Profile is reachable at ${width} px`, async ({
      page,
      installWallet,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await installWallet()
      await page.goto('/mine')
      await connect(page)

      async function openDocsFamily(name: string, href: string) {
        if (width >= 1024) {
          if (['Docs', 'Fairness', 'Contracts'].includes(name)) {
            await page
              .getByRole('complementary', { name: 'Quick actions' })
              .getByRole('link', { name })
              .click()
          } else {
            // About, Terms, and Privacy are in the footer links under the deploy button.
            await page
              .getByRole('navigation', { name: 'Footer' })
              .getByRole('link', { name })
              .click()
          }
        } else if (width >= 768) {
          await page.getByRole('banner').getByRole('button', { name: 'Menu' }).click()
          await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name }).click()
        } else {
          await page
            .getByRole('navigation', { name: 'Primary mobile' })
            .getByRole('button', { name: 'More' })
            .click()
          await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name }).click()
        }
        await expect(page).toHaveURL(new RegExp(`${href}$`))
        await page.goto('/mine')
        await connect(page)
      }

      for (const [name, href] of [
        ['Docs', '/docs'],
        ['Fairness', '/fairness'],
        ['Contracts', '/contracts'],
        ['About', '/about'],
        ['Terms', '/terms'],
        ['Privacy', '/privacy'],
      ] as const) {
        await openDocsFamily(name, href)
      }

      // Profile: the address menu from 1024 px, the More sheet or the menu button below.
      if (width >= 1024) {
        await page
          .getByRole('banner')
          .getByRole('button', { name: /^0x7099/ })
          .click()
        await page.getByRole('link', { name: 'Profile' }).click()
      } else if (width >= 768) {
        await page.getByRole('banner').getByRole('button', { name: 'Menu' }).click()
        await page
          .getByRole('dialog', { name: 'More' })
          .getByRole('link', { name: 'Profile' })
          .click()
      } else {
        await page
          .getByRole('navigation', { name: 'Primary mobile' })
          .getByRole('button', { name: 'More' })
          .click()
        await page
          .getByRole('dialog', { name: 'More' })
          .getByRole('link', { name: 'Profile' })
          .click()
      }
      await expect(page).toHaveURL(/\/profile$/)
    })
  }
})
