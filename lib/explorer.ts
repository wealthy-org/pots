import { activeChain } from './chains'

const TESTNET_EXPLORER = 'https://explorer.testnet.chain.robinhood.com'

/**
 * Block explorer base URL. The testnet explorer is known; for any other chain the URL comes from
 * the optional NEXT_PUBLIC_EXPLORER_URL, and no link is shown when it is not set.
 */
const explorerBase: string | undefined =
  process.env.NEXT_PUBLIC_EXPLORER_URL || (activeChain.id === 46630 ? TESTNET_EXPLORER : undefined)

export function addressUrl(address: string): string | undefined {
  return explorerBase ? `${explorerBase.replace(/\/$/, '')}/address/${address}` : undefined
}
