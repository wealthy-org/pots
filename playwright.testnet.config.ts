import { spawnSync } from 'node:child_process'
import { defineConfig } from '@playwright/test'

const appPort = 3218
const testnetRpc = process.env.E2E_RPC_URL ?? 'https://robinhood-sepolia-rpc.publicnode.com'

function recentBlock(): string {
  const script = `fetch(${JSON.stringify(testnetRpc)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]})}).then(r=>r.json()).then(j=>console.log(parseInt(j.result,16)-3000)).catch(()=>console.log(0))`
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 30_000 })
  const value = Number(result.stdout.trim())
  return String(Number.isFinite(value) && value > 0 ? value : 0)
}

export default defineConfig({
  testDir: './tests/e2e-testnet',
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
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
    url: `http://localhost:${appPort}/stats`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: '46630',
      NEXT_PUBLIC_ROBINHOOD_RPC_URL: testnetRpc,
      NEXT_PUBLIC_INDEXER_URL: 'https://indexer.e2e.invalid/v1/graphql',
      NEXT_PUBLIC_ROUND_MANAGER_ADDRESS: process.env.E2E_MANAGER_ADDRESS ?? '',
      NEXT_PUBLIC_POTS_TOKEN_ADDRESS: process.env.E2E_TOKEN_ADDRESS ?? '',
      NEXT_PUBLIC_ROUND_MANAGER_DEPLOY_BLOCK: process.env.E2E_DEPLOY_BLOCK ?? recentBlock(),
    },
  },
})
