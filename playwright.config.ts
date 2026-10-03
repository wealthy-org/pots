import { defineConfig } from '@playwright/test'

import { KEEPER_KEY, KEEPER_SECRET } from './tests/support/chain'

const appPort = 3217
const anvilPort = 8599

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${appPort}`,
    channel: 'msedge',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  webServer: {
    command: `npx next dev -p ${appPort}`,
    url: `http://localhost:${appPort}/mine`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: '31337',
      NEXT_PUBLIC_ROBINHOOD_RPC_URL: `http://127.0.0.1:${anvilPort}`,
      NEXT_PUBLIC_INDEXER_URL: '',
      KEEPER_PRIVATE_KEY: KEEPER_KEY,
      KEEPER_SECRET,
    },
  },
})
