import { expect, type Page } from '@playwright/test'

export async function connect(page: Page) {
  const header = page.getByRole('banner')
  const connectButton = header.getByRole('button', { name: 'Connect wallet' })
  const addressButton = header.getByRole('button', { name: /^0x7099/ })
  await expect(connectButton.or(addressButton)).toBeVisible()
  if (await connectButton.isVisible()) {
    // After a reload the wallet reconnects by itself and the button can vanish mid-click.
    await connectButton.click({ timeout: 3000 }).catch(() => undefined)
  }
  await expect(addressButton).toBeVisible()
}

export function square(page: Page, id: number) {
  return page.getByRole('button', { name: new RegExp(`^Block ${id},`) })
}

export async function selectSquares(page: Page, ids: number[]) {
  for (const id of ids) {
    await square(page, id).click()
  }
}

export async function setAmount(page: Page, eth: string) {
  await page.getByLabel('Amount per block').fill(eth)
}

export async function reviewEntry(page: Page) {
  await page.getByRole('button', { name: /^MINE/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Review deploy' })
  await expect(dialog).toBeVisible()
  return dialog
}

export async function enterThroughUi(page: Page, ids: number[], eth: string) {
  await selectSquares(page, ids)
  await setAmount(page, eth)
  const dialog = await reviewEntry(page)
  await dialog.getByRole('button', { name: 'Confirm in wallet' }).click()
  await expect(page.getByText('Deployed', { exact: true })).toBeVisible()
}

/** The operator fallbacks live on an unlinked route (ADR-014). */
export async function openOps(page: Page) {
  await page.goto('/ops')
  await connect(page)
}

export async function openMine(page: Page) {
  await page.goto('/mine')
  await connect(page)
}

export function keeperButton(page: Page, name: string | RegExp) {
  return page.getByRole('button', { name })
}
