import { test as base, expect } from '@playwright/test'
import { ANVIL_URL, PLAYER_KEY, chainTimeMs, revert, snapshot } from '../support/chain'
import { installMockWallet, type WalletMode } from '../support/wallet'

type Fixtures = {
  chainIsolation: void
  installWallet: (options?: { chainId?: number; mode?: WalletMode }) => Promise<void>
  syncBrowserClock: () => Promise<void>
}

export const test = base.extend<Fixtures>({
  chainIsolation: [
    async ({}, applyFixture) => {
      const id = await snapshot()
      await applyFixture()
      await revert(id)
    },
    { auto: true },
  ],
  installWallet: async ({ page }, applyFixture) => {
    await applyFixture(async (options = {}) => {
      await installMockWallet(page, {
        privateKey: PLAYER_KEY,
        chainId: options.chainId ?? 31337,
        rpcUrl: ANVIL_URL,
        mode: options.mode,
      })
    })
  },
  syncBrowserClock: async ({ page }, applyFixture) => {
    await applyFixture(async () => {
      await page.clock.install({ time: await chainTimeMs() })
    })
  },
})

export { expect }
