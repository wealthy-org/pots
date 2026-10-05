import { defineConfig } from '@playwright/test'

import { KEEPER_KEY, KEEPER_SECRET } from './tests/support/chain'

// Chat suite: the local Anvil stack plus the Neon `dev` branch. Run with `npm run e2e:chat`, which
// loads .env.local (DATABASE_URL of the dev branch). It never runs in CI.
const appPort = 3221
const anvilPort = 8599

export const CHAT_SESSION_SECRET = 'e2e-chat-session-secret-0123456789abcdef0123'

export default defineConfig({
  testDir: './tests/e2e-chat',
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
      NEXT_PUBLIC_CHAT_ENABLED: 'true',
      CHAT_SESSION_SECRET,
      KEEPER_PRIVATE_KEY: KEEPER_KEY,
      KEEPER_SECRET,
    },
  },
})
