import { expect, type Page } from '@playwright/test'

export async function connect(page: Page) {
  const header = page.getByRole('banner')
  const connectButton = header.getByRole('button', { name: 'Connect wallet' })
  const addressButton = header.getByRole('button', { name: /^0x7099/ })
  await expect(connectButton.or(addressButton)).toBeVisible()
  if (await connectButton.isVisible()) {
    await connectButton.click()
  }
  await expect(addressButton).toBeVisible()
}

export function square(page: Page, id: number) {
  return page.getByRole('button', { name: new RegExp(`^Square ${id},`) })
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
  await page.getByRole('button', { name: /^Review entry/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Review entry' })
  await expect(dialog).toBeVisible()
  return dialog
}

export async function enterThroughUi(page: Page, ids: number[], eth: string) {
  await selectSquares(page, ids)
  await setAmount(page, eth)
  const dialog = await reviewEntry(page)
  await dialog.getByRole('button', { name: 'Confirm in wallet' }).click()
  await expect(page.getByText('Entry confirmed')).toBeVisible()
}

export function keeperButton(page: Page, name: string | RegExp) {
  return page.getByRole('button', { name })
}
