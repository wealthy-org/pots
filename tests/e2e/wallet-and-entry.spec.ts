import { test, expect } from './fixtures'
import { connect, enterThroughUi, selectSquares, setAmount, square } from '../support/ui'
import { setWalletMode } from '../support/wallet'
import { manager } from '../support/chain'

test.describe('wallet and entry', () => {
  test('connects an injected wallet and disconnects', async ({ page, installWallet }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)

    await page
      .getByRole('banner')
      .getByRole('button', { name: /^0x7099/ })
      .click()
    await page.getByRole('button', { name: 'Disconnect' }).click()
    await expect(
      page.getByRole('banner').getByRole('button', { name: 'Connect wallet' }),
    ).toBeVisible()
  })

  test('shows a wrong network banner and recovers after switching', async ({
    page,
    installWallet,
  }) => {
    await installWallet({ chainId: 1 })
    await page.goto('/mine')
    await connect(page)

    const banner = page.getByRole('alert').filter({ hasText: 'Wrong network' })
    await expect(banner).toBeVisible()
    await banner.getByRole('button', { name: 'Switch network' }).click()
    await expect(banner).toBeHidden()
  })

  test('keeps the selection and explains a rejected signature', async ({ page, installWallet }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)
    await selectSquares(page, [3])
    await setAmount(page, '0.01')

    await page.getByRole('button', { name: /^MINE/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Review deploy' })
    await setWalletMode(page, 'reject')
    await dialog.getByRole('button', { name: 'Confirm in wallet' }).click()

    await expect(dialog.getByRole('alert')).toHaveText('Signature rejected in the wallet.')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('1/25').first()).toBeVisible()
  })

  test('enters a round through the review modal', async ({ page, installWallet }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)
    await selectSquares(page, [3, 7])
    await setAmount(page, '0.01')

    const dialog = await (async () => {
      await page.getByRole('button', { name: /^MINE/ }).click()
      return page.getByRole('dialog', { name: 'Review deploy' })
    })()
    await expect(dialog.getByText('0.02 ETH').first()).toBeVisible()
    await expect(dialog.getByText('3, 7')).toBeVisible()
    await dialog.getByRole('button', { name: 'Confirm in wallet' }).click()

    await expect(page.getByText('Deployed', { exact: true })).toBeVisible()
    await expect(page.getByText('Your deploy this round: 0.02 ETH')).toBeVisible()
    await expect(square(page, 3)).toHaveAccessibleName(/0\.01 ETH deployed/)
  })

  test('closes the review modal with Escape', async ({ page, installWallet }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)
    await selectSquares(page, [1])
    await page.getByRole('button', { name: /^MINE/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Review deploy' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('selects squares from the keyboard with roving focus', async ({ page, installWallet }) => {
    await installWallet()
    await page.goto('/mine')
    await square(page, 1).focus()
    await page.keyboard.press('ArrowRight')
    await expect(square(page, 2)).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(square(page, 7)).toBeFocused()
    await page.keyboard.press('End')
    await expect(square(page, 25)).toBeFocused()
    await page.keyboard.press('Home')
    await expect(square(page, 1)).toBeFocused()
    await page.keyboard.press('Space')
    await expect(square(page, 1)).toHaveAttribute('aria-pressed', 'true')
  })

  test('shows the paused banner and blocks new entries', async ({ page, installWallet }) => {
    await installWallet()
    await manager.write('pause')
    await page.goto('/mine')
    await connect(page)

    await expect(
      page.getByRole('status').filter({ hasText: 'New deploys are paused' }),
    ).toBeVisible()
    await selectSquares(page, [2])
    await expect(page.getByRole('button', { name: /^MINE/ })).toBeDisabled()
    await expect(page.getByText('New deploys are paused', { exact: true })).toBeVisible()
  })

  test('entering through the helper keeps the entry visible after a reload', async ({
    page,
    installWallet,
  }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)
    await enterThroughUi(page, [9], '0.005')
    await page.reload()
    await connect(page)
    await expect(page.getByText('Your deploy this round: 0.005 ETH')).toBeVisible()
  })
})

test.describe('plan flag unset', () => {
  test('keeps the v2 surface: no plan controls and a plain MINE button', async ({
    page,
    installWallet,
  }) => {
    await installWallet()
    await page.goto('/mine')
    await connect(page)
    await page.getByRole('button', { name: 'Auto', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Auto plan' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Start auto/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^MINE/ })).toBeVisible()
    // The chat is off too: no rail button and no panel (NEXT_PUBLIC_CHAT_ENABLED is unset).
    await expect(page.getByRole('button', { name: 'Chat', exact: true })).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Chat' })).toHaveCount(0)
  })
})
