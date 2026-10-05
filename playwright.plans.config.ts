import { defineConfig } from '@playwright/test'

import { KEEPER_KEY, KEEPER_SECRET, PLAN } from './tests/support/chain'

// The plan feature is behind NEXT_PUBLIC_AUTO_PLAN_ADDRESS. The default suite runs with it unset
// (the v2 surface); this one turns it on against the plan contract of the local deploy.
const appPort = 3219
const anvilPort = 8599

export default defineConfig({
  testDir: './tests/e2e-plans',
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
      // Next loads .env.local, which holds the Neon dev string: the default suites never use it.
      DATABASE_URL: '',
      NEXT_PUBLIC_AUTO_PLAN_ADDRESS: PLAN,
      KEEPER_PRIVATE_KEY: KEEPER_KEY,
      KEEPER_SECRET,
    },
  },
})
