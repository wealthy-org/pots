import { test, expect, type Page } from '@playwright/test'

const rpcUrl = process.env.E2E_RPC_URL ?? 'https://robinhood-sepolia-rpc.publicnode.com'

async function chainHead(): Promise<bigint> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
  })
  const body = (await response.json()) as { result: string }
  return BigInt(body.result)
}

async function serveIndexer(page: Page, latestProcessed: bigint, blockHeight: bigint) {
  await page.route(/indexer\.e2e\.invalid/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          chain_metadata: [
            {
              block_height: blockHeight.toString(),
              latest_processed_block: latestProcessed.toString(),
            },
          ],
          known: [],
          ProtocolStats_by_pk: null,
        },
      }),
    }),
  )
}

test.describe('indexer freshness on Stats (public RPC, no funds)', () => {
  test('uses the indexer when it is close to the chain head', async ({ page }) => {
    const head = await chainHead()
    await serveIndexer(page, head, head)
    await page.goto('/stats')

    await expect(
      page.getByText(`Source: indexer, last indexed block ${head}`, { exact: false }),
    ).toBeVisible()
    await expect(page.getByText('The indexer is behind the chain')).toBeHidden()
  })

  test('falls back to the contract and says why when the indexer is stale', async ({ page }) => {
    await serveIndexer(page, 1n, 1n)
    await page.goto('/stats')

    await expect(page.getByText(/^Source: contract events, read at block \d+/)).toBeVisible()
    await expect(
      page.getByText('The indexer is behind the chain, so this view was read from the contract.'),
    ).toBeVisible()
  })

  test('falls back to the contract when the indexer cannot be reached', async ({ page }) => {
    await page.route(/indexer\.e2e\.invalid/, (route) => route.abort())
    await page.goto('/stats')

    await expect(page.getByText(/^Source: contract events, read at block \d+/)).toBeVisible()
    await expect(
      page.getByText('The indexer could not be reached, so this view was read from the contract.'),
    ).toBeVisible()
  })

  test('stops calling an indexer that returns unusable data', async ({ page }) => {
    let calls = 0
    await page.route(/indexer\.e2e\.invalid/, (route) => {
      calls += 1
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: 'field not found' }] }),
      })
    })
    await page.goto('/stats')

    await expect(
      page.getByText(
        'The indexer returned data this app cannot use, so this view was read from the contract.',
      ),
    ).toBeVisible()
    expect(calls).toBe(1)
  })
})
